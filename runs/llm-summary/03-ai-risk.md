# AI Risk Assessment — Item Summary (`summarizeItems`)

> Owner: AI Governance Agent
> Status: pass
> Frameworks: NIST AI RMF (+ GenAI Profile AI-600-1) · EU AI Act (+ GPAI
> Code of Practice) · ISO 42001 · ISO 42005 (AI system impact assessment)
> Source model card: N/A — no trained or hosted model exists in this slice.
> `DeterministicSummarizer` is rule-based (deterministic string
> composition, not ML). `PlaceholderLlmSummarizer` is an unconfigured
> stub with no model, vendor, or weights to card.
> Reviewed against: `src/services/summary.js`, `test/summary.test.js`,
> `runs/llm-summary/02-impl-notes.md`, `.agentic/SAFETY_INVARIANTS.md`
> (branch `slice/llm-summary`, commit `9c96bdd`).

## Capability

- **What it does:** `summarizeItems(userId, adapter?)` returns a short
  summary of a user's saved items — the true live item count, and (if any
  items exist) a verbatim, length-capped snippet of the most recent item's
  content. Default adapter (`DeterministicSummarizer`) composes this from
  the real `items` array only — no model, no network, no randomness. A
  second adapter (`PlaceholderLlmSummarizer`) exists as an interface seam
  for a future LLM-backed implementation; in this build it unconditionally
  throws and is never auto-constructed anywhere in `src/`.
- **Intended use:** In-app summary of the requesting user's own saved
  items, surfaced back to that same user. It informs no decision beyond
  the user's own awareness of their saved content — it does not rank,
  filter, recommend, or feed any downstream automated decision.
- **Users / subjects affected:** The authenticated user themselves,
  summarizing only their own data. No third party's data is processed or
  disclosed (see user-scoping, below). No vulnerable or protected group is
  targeted by design; the free-text `content` field could incidentally
  hold sensitive information the user chose to save, but the deterministic
  path only ever echoes a truncated, verbatim substring of that data back
  to the same user — it performs no new inference and makes no new
  disclosure to anyone.

## Risk tier

- **EU AI Act tier:** Minimal.
- **NIST AI RMF framing:**
  - *Govern* — this assessment, the model-inventory entry below, and the
    unconditionally-throwing placeholder (gated behind a separate,
    explicit future approval per `APPROVAL_RECORD-1.md` as referenced in
    `summary.js` and `02-impl-notes.md`) together are the governance
    control: no code path in this build can reach a real model without a
    deliberate, separately-approved change.
  - *Map* — context is narrow and well-bounded: single-user, own-data,
    read-only summarization; no third parties, no protected-class
    decisioning, no downstream automated consequence.
  - *Measure* — the eval suite (`test/summary.test.js`) directly measures
    every safety invariant the *shipped* code path can violate (see Eval
    coverage below). Nothing is measured for the LLM path because nothing
    executes on that path yet — correctly deferred, not skipped.
  - *Manage* — risk is managed by fail-closed construction: the LLM
    adapter throws before any output, config, or environment variable can
    coax it into running, and `itemCount` is clamped to ground truth
    (`listItems()`) independent of which adapter is used.
- **Rationale:** Two independent reasons support Minimal, not Limited or
  High:
  1. **Definitional.** `DeterministicSummarizer` — the only adapter that
     actually executes in this build — is pure rule-based string
     composition (count + verbatim substring). It does not infer
     predictions, content, recommendations, or decisions from its input
     in the sense EU AI Act Art. 3(1) uses to define an "AI system"; a
     reasonable reading is that the *shipped* code path sits outside the
     Act's definitional scope entirely. This assessment does not rely on
     that reading to reach its conclusion, but notes it because the
     feature is governed here as AI-adjacent regardless (it ships under
     an "llm-summary" slice name and carries a live LLM seam), which is
     the more conservative and correct posture for an AI Governance
     review.
  2. **Use-case.** Even treated generously as in-scope, this is
     single-user summarization of a user's own saved notes, returned only
     to that user, informing no decision with legal or similarly
     significant effect. It matches none of the Annex III high-risk
     categories (biometric ID/categorization, critical infrastructure,
     education/vocational access, employment/worker management, access to
     essential services or credit, law enforcement, migration/border
     control, administration of justice or democratic processes), and
     none of the Art. 5 prohibited-practice patterns (manipulation,
     exploitation of vulnerability, social scoring, biometric
     categorization of protected attributes, real-time remote biometric
     ID, emotion inference in workplace/education, predictive-policing-by-
     profiling). Unacceptable and High are both ruled out with high
     confidence.
  - **If the deferred rule-5 slice wires a real model:** the tier would
    most likely move to **Limited**, not High, for the same use-case
    reason above (still no Annex III fit) — but Article 50 transparency
    duties would newly attach, because the system would then be
    generating content presented to a user rather than deterministically
    reformatting it. That shift is exactly why `PlaceholderLlmSummarizer`
    throwing today is load-bearing: it prevents this capability from
    silently crossing into Limited-tier obligations without governance
    review. Re-run this assessment in full at that time — do not treat
    this document as pre-clearing the future model.

> EU AI Act timing: GPAI obligations apply now; the Commission's enforcement
> powers begin 2 Aug 2026; models on the market before 2 Aug 2025 have until
> 2 Aug 2027 to comply. The GPAI Code of Practice is the standard vehicle to
> demonstrate compliance.

**GPAI Code of Practice applicability:** not applicable to Stash today —
Stash trains or provides no general-purpose AI model. If the rule-5 slice
integrates a third-party hosted LLM, Stash becomes a *deployer* of that
model, not a GPAI provider; systemic-risk documentation and Code of
Practice commitments are the upstream model provider's obligation. Stash's
own obligation at that point is the Art. 50 deployer-side transparency
duty noted above.

## Obligations for this tier

| Obligation | Required at this tier? | Met? | Evidence |
|------------|------------------------|------|----------|
| Transparency / disclosure to users | No (Minimal tier; Art. 50 attaches at Limited, when content is generated rather than reformatted) | Y | `DeterministicSummarizer.summarize` (`src/services/summary.js:60-74`) — output is a direct, verifiable function of the user's own data; nothing is generated that would require disclosure |
| Human oversight | No (Minimal tier) | Y | `PlaceholderLlmSummarizer` throws unconditionally, no suppressing config/env/arg exists, and it is never auto-constructed in `src/` — confirmed by the `grep -rn "Summarizer" src/` spot-check in `02-impl-notes.md` (only `new DeterministicSummarizer()` is ever constructed, at `summary.js:127`) |
| Robustness / accuracy threshold | No formal threshold required (Minimal tier) | Y | "No invention" is enforced by construction, not just by test: `itemCount` in both the return value and the audit event is always `items.length` from `listItems()`'s real output, never read from adapter output (`summary.js:132-134`); covered by `test/summary.test.js` EVAL 1 and EVAL 2 |
| Documentation / model card | No model card required (no trained/hosted model) | Y (proportionate) | Adapter contract documented via JSDoc (`summary.js:13-29`); `runs/llm-summary/02-impl-notes.md` serves as the design record (no separate Architect stage for this slice) |
| Logging / traceability | Not required by tier, but `.agentic/SAFETY_INVARIANTS.md` #3/#4 impose an internal bar regardless of tier | Y | `items.summarized` audit event carries only `{itemCount, generationMode}`; content/text/snippet keys verified absent, including a `JSON.stringify` substring check against planted "secret payload" content — `summary.js:137-140`, `test/summary.test.js` EVAL 5 |

## Eval coverage

The task named four safety invariants for this capability: no-invention,
user-scoping, content-not-logged, placeholder-throws. All four are covered
for the code path that actually executes today.

- **Covered:**
  - *No invention (count)* → EVAL 1, "claimed itemCount always equals
    `listItems(userId).length`", swept across n = 0..3.
  - *No invention (snippet/content)* → EVAL 2, "snippet is always a true
    substring of the actual most-recent item's content"; reinforced by
    the long-content-truncation happy-path test (truncation always takes
    a prefix, so it's a true substring by construction) and the
    soft-deleted-items-excluded happy-path test.
  - *User-scoping* → EVAL 3, checked bidirectionally (u1 never sees u2's
    content or count, and vice versa).
  - *Content-not-logged* → EVAL 5, checks both individual key absence
    (`content`/`text`/`snippet` not in `evt.metadata`) and a whole-object
    `JSON.stringify` substring check against a planted secret string.
  - *Placeholder-throws* → covered from three angles: EVAL 4 (adapter
    throws directly, message names itself), the unlabeled test
    immediately after EVAL 5 (no `items.summarized` audit event is
    recorded when the placeholder throws — a failed summary is never
    audited as a successful one), and EVAL 6 (differential: the
    placeholder throws via `summarizeItems` while the default deterministic
    adapter succeeds in the same test, isolating the adapter as the sole
    variable).
  - Cross-checked against `.agentic/SAFETY_INVARIANTS.md`: invariants #4
    (no item content in logs) and #5 (user only affects own items) are
    the two this capability actually touches, and both are independently
    enforced structurally *and* tested — not test-coverage-only.

- **Gaps to fill before release:** none, for the capability as actually
  shipped. The LLM path is structurally unreachable (throws before doing
  any work), so there is nothing on that path to evaluate yet.

- **Gaps to fill before the future rule-5 (real-model) slice ships** —
  recorded now so they aren't rediscovered later:
  1. `itemCount` is clamped to `listItems()` ground truth regardless of
     adapter, but that clamp does **not** extend to a future LLM
     adapter's free-text `text`/`snippet` fields. Nothing in
     `summarizeItems` today would catch a hallucinated quote or a
     fabricated detail in generated prose the way it already catches a
     miscounted `itemCount`. Before a real model is wired, either (a) add
     a structural check that rejects/flags an adapter's `snippet` unless
     it is a verbatim substring of real item content, or (b) stand up an
     invention-detection eval with adversarial cases, or both.
  2. No golden set exists. None is needed today — the current assertions
     are exact-match (equality / substring checks), which is strictly
     stronger than a golden-set-with-similarity-scoring approach for a
     deterministic function. A golden set (for judging free-text quality
     and tone, not just invariants) will be needed once generation is
     real.
  3. No eval-refresh cadence is defined anywhere in the inputs reviewed.
     Not a gap today (deterministic code cannot drift), but a trigger
     (model version bump or prompt change → mandatory eval re-run) must
     exist before rule-5 ships.

- **Golden set:** none — not applicable to the current deterministic-only
  implementation.
- **Refresh status:** current / not due — no generative component exists
  to drift.

## Model inventory entry

- **`summary.js` — item-summary capability** (branch `slice/llm-summary`,
  commit `9c96bdd`)
  - Active adapter: `DeterministicSummarizer` — rule-based, deterministic
    string composition; not a trained/statistical model; no version,
    weights, or vendor to track. Owner: AI Engineer (build) / AI
    Governance (risk posture). Tier: Minimal. Last reviewed: 2026-07-25.
  - Dormant adapter: `PlaceholderLlmSummarizer` (`generationMode: "llm"`)
    — unconfigured stub, throws unconditionally on every call; no model,
    vendor, network call, or key is wired anywhere in this build. Not a
    reviewable model in its current form. Gated behind a separate, future
    rule-5 approval (`APPROVAL_RECORD-1.md`, as referenced in
    `summary.js` and `02-impl-notes.md`). Re-tier and re-review at wiring
    time — do not treat this entry as pre-clearance.

## Post-deployment monitoring

- **Behavioural drift:** N/A today — `DeterministicSummarizer` is pure,
  stateless, and cannot drift (same input always yields the same output).
  Required once a real model is wired: hallucination/invention rate,
  output-length drift, and refusal-rate changes across model or prompt
  version bumps.
- **Fairness over time:** Low relevance today — no protected-class
  decisioning occurs, and the identical algorithm runs for every user.
  Once real generation exists, monitor quality-of-service consistency
  across languages and content types as a proxy, even though this
  use-case does not allocate opportunity or resources.
- **No-invention monitoring (specifically named in this review's brief):**
  enforced structurally and by eval today for `itemCount`; per the gap
  above, the same guarantee does not yet extend to free-text output
  because no free-text output exists. This must be closed — structurally,
  by monitoring, or both — before the rule-5 slice ships, not after.
- **Owner in production:** AI Governance (cross-slice posture; owns this
  assessment and its refresh) plus the existing audit-log substrate
  (`recordAuditEvent`) for traceability.

## Findings

| Finding | Severity (blocker / required-fix / advisory) |
|---------|----------------------------------------------|
| A future LLM adapter's free-text `text`/`snippet` output has no structural or eval guard against invention — only `itemCount` is currently clamped to ground truth. | Required-fix — gates the future rule-5 (real-model) slice; does not block this slice, since the LLM path is unreachable today. |
| No golden set and no eval-refresh cadence are defined. Correct as-is today (nothing generative exists to drift or to score by similarity); must exist before rule-5. | Required-fix — gates rule-5; does not block this slice. |
| `02-impl-notes.md`'s file-purpose table states "20 tests: happy paths (6), the 6 required safety-invariant EVAL cases, a guard case" (6+6+1=13, not 20 under any reading). The actual suite has 14 new tests (6 happy-path + 7 EVAL-labeled, including one unlabeled test between EVAL 5 and EVAL 6 + 1 guard), which matches the verified "+14, 35→49 total" figure given later in the same document and the actual `npm test` output. Cosmetic prose inconsistency only — does not affect shipped code, actual coverage, or the verified test count. | Advisory. |

## Recommendation

- [x] **Pass** to Compliance Reviewer / Release Manager — for the
      capability as actually shipped: deterministic-first, real-data-only
      composition, with the LLM path a genuinely inert, unconditionally-
      throwing stub (confirmed by source inspection, not just by test).
      All four named safety invariants are covered by both structural
      enforcement and eval. No obligation at Minimal tier is unmet.
- [ ] Required fix — eval gaps or obligations unmet.
- [ ] Block — unacceptable risk or unmet high-risk obligation; escalated
      to human.

Two required-fixes are registered above as **pre-conditions for the
future rule-5 slice** (real model wiring), not as blockers for this one.
Whoever picks up rule-5 should treat this document's "Eval coverage" and
"Findings" sections as its starting checklist, and this assessment should
be re-run in full — tier included — once a real model is behind
`PlaceholderLlmSummarizer`'s replacement.

## Hand off

To the Compliance Reviewer (feeds ISO 42001 control mapping — this
document is also, self-referentially, the ISO 42005 AI-system impact
assessment for this capability) and the Release Manager (Minimal tier:
no high-risk gating required before this slice's release).

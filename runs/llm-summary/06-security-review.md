# Security & Privacy Review — llm-summary

> Owner: Security & Privacy Agent (opus)
> Status: PASS — go to Release
> Source diff: `9c96bdd85b4721af2e2f0bfdc9a928ac530aa300` ("Implement
> item-summary composer, LLM adapter boundary, and orchestration"), branch
> `slice/llm-summary`, parent `f10b382`.
> Independent pass — findings re-derived from the diff and a handful of
> targeted greps, not inherited from QA/Governance. Where I reused their
> work I re-verified it.

## Verdict

**PASS.** No blocker, no required-fix for this slice. Safe to release.

This is a tight, additive, read-only slice with a genuinely inert LLM seam.
Every risk that a "summary" capability would normally carry (invention,
cross-user disclosure, content-in-logs, silent model wiring, cost, prompt
injection) is either structurally foreclosed today or correctly deferred to
the future rule-5 real-model slice with a named precondition.

## What I independently verified (not just re-read)

| Check | Method | Result |
|---|---|---|
| Files touched | `git show --name-status 9c96bdd` | Exactly 5: 2 run-artefacts, `scripts/build-check.mjs` (+1 line), `src/services/summary.js` (new), `test/summary.test.js` (new). No `.env`, no credential file, no lockfile change. |
| Secrets in the diff | regex sweep of added lines (`api_key\|secret\|token\|password\|bearer\|-----BEGIN\|sk-…\|AKIA…\|xox…\|ghp_…`) | No credentials. Every "secret" hit is a **planted test marker** (`"u2-secret content"`, `"very secret payload nobody should log"`) or doc prose — i.e. bait strings used to *prove* content isn't logged. |
| I/O surface of the new module | `grep -nEi 'console\.\|process\.env\|require(\|fetch\|http\|child_process\|exec\|eval(\|import(\|openai\|anthropic' src/services/summary.js` | **Zero matches.** `summary.js`'s only imports are `listItems` (`./savedItems.js`) and `recordAuditEvent` (`./audit.js`) — both local, in-memory. No network, no env, no logging, no dynamic eval, no provider SDK. |
| `listItems` scoping (reused unchanged) | read `savedItems.js:17-21` | `filter((i) => i.userId === userId && i.deletedAt === null)` — user-scoped **and** soft-delete-filtered at the source. |
| `recordAuditEvent` (reused unchanged) | read `audit.js:10-20` | Stores the `metadata` object verbatim into an in-memory array. No `console`, no stringify-to-log, no content derivation. The audit event contains exactly what the caller passes and nothing more. |
| Only-`DeterministicSummarizer`-in-`src/` | `grep -rnE 'new (Deterministic\|PlaceholderLlm)Summarizer' src/` | One hit: `summary.js:127`, `new DeterministicSummarizer()` as the default param. `PlaceholderLlmSummarizer` is **never** constructed in `src/`. |
| Placeholder is test-only | `grep -rn 'new PlaceholderLlmSummarizer' src/ test/` | Three hits, all in `test/summary.test.js` (171, 207, 221) — deliberate injections to prove the throw. None in production code. |
| Capability is unwired | `grep -rn 'summarizeItems\|from "./summary' src/`; `grep summary src/server.js` | `summarizeItems` is referenced only inside its own file. `server.js`/`index.js` do not import it. It is a pure library export — not reachable over HTTP, no cron, no auto-invocation. |

## Findings

### Blocker
None.

### Required-fix (this slice)
None.

### Advisory (fold into a future slice; none block release)

1. **Rule-5 preconditions carried forward** (from AI-risk 03 + FinOps 04, re-affirmed here) — see the dedicated section below. These gate the *future real-model slice*, not this one.
2. **Audit strategy will need revisiting at rule-5** (my addition; see audit-ordering verdict). Correct today; becomes a live gap the moment the model path can incur a billable/external call.
3. **`02-impl-notes.md` says "20 tests"** for `test/summary.test.js`; the real count is 14 (6 happy-path + 7 EVAL + 1 guard), which matches `npm test` (49 total) and the same document's own later "+14, 35→49" line. Cosmetic prose only — no effect on shipped code, coverage, or the verified count. Already flagged by QA and Governance. No release action.

## Per-invariant confirmation

### Invariant 4 — No item content in logs — **PASS**

`summarizeItems` passes only `{ itemCount, generationMode }` to
`recordAuditEvent` (`summary.js:137-140`). The two content-bearing values
the slice produces (`text`, `snippet`) are returned to the *caller* and are
never handed to the audit event. `recordAuditEvent` (`audit.js:10-20`,
unchanged) stores that metadata verbatim with no logging path of its own,
and `summary.js` contains no `console.*`, no `process.env`, no logging
whatsoever (grep-confirmed). There is therefore **no code path** — primary
or secondary — by which saved content reaches a log or the audit trail.
Runtime-confirmed independently by QA's probe (c) incl. a whole-event
`JSON.stringify` substring check against a planted marker.

### Invariant 5 — A user only ever affects their own items — **PASS**

`summarizeItems` calls `listItems(userId)` with the caller's own `userId`
(`summary.js:132`) and audits under that same `userId` (`:137`).
`listItems` filters `i.userId === userId && i.deletedAt === null`
(`savedItems.js:17-21`, unchanged), so the summarised set is structurally
the caller's own live items — another user's items cannot enter it. The new
module has no second `userId` parameter and no cross-user read path
(`userId` appears only in the guard, the `listItems` call, and the audit
call). This is a read-only slice, so the "IDs rejected, never deleted" half
of the invariant is n/a; the scoping half holds by construction.
Runtime-confirmed bidirectionally by QA's probe (b).

### Invariant 6 — AI/LLM adapters throw + no-invention — **PASS** (both halves)

**Throw / rule-5 half.** `PlaceholderLlmSummarizer.summarize()` throws
unconditionally (`summary.js:113-118`) — it takes no arguments and reads no
config/env, so nothing suppresses the throw. It is **never auto-constructed
in `src/`**: the only Summarizer constructed under `src/` is
`new DeterministicSummarizer()` (the default parameter at `:127`); the
placeholder is constructed only by tests (grep-confirmed). No real model,
provider SDK, network call, API key, or env read exists anywhere in the
diff. The shipped scope is exactly what `APPROVAL_RECORD-1.md` approved:
deterministic-first + a throwing placeholder seam, **no** live inference.
Defense-in-depth: because `summarizeItems` is also unwired to any route or
cron, the LLM path is *doubly* unreachable (not invoked + throws).

**No-invention half.** `itemCount` is `items.length` taken from
`listItems`' real output (`summary.js:132-134`) and used in **both** the
return value and the audit event — it is never read from the adapter's
return (the adapter returns only `{ text, snippet }`; it has no count to
drift). So the audited/returned count structurally cannot exceed or diverge
from the user's true live-item count, regardless of adapter. Soft-deleted
items are excluded by `listItems`, so deleted content cannot resurface in
the snippet. The deterministic snippet is `content.slice(0, SNIPPET_MAX_LEN)`
— a verbatim substring by construction. QA probe (a) confirmed this at
runtime across seed/delete/re-check scenarios.

> Note on the phantom "invariant 7": QA (`05`) correctly refused to
> fabricate a citation for an invariant that did not exist in the file — a
> no-invention discipline applied to its own artefact, which is exactly the
> property under test here. That flag is now resolved: the real
> LLM-adapter/no-invention discipline was uncodified and has been added as
> invariant **6**; there was never a 7. I verified against 4/5/6 as they
> actually exist in `.agentic/SAFETY_INVARIANTS.md` today.

## Audit-coverage & the audit-ordering question — **CONCUR** with only-on-success

**Coverage.** The only record-emitting action the slice adds is the
`items.summarized` audit event, emitted on the success path. The slice has
no other side-effecting action — no send, no write, no delete (`listItems`
is a read; `recordAuditEvent` *is* the audit). No pre-existing audit event
was removed, renamed, or weakened (`savedItems.js` / `audit.js` /
`digest.js` are untouched — confirmed by `--name-status`; QA probe (e)
re-confirmed digest still `503` and bulk-delete still audits). Coverage is
complete for what this slice does.

**Ordering verdict — I concur that `items.summarized` should be audited
only on success, and this is the *correct* choice here, not a tolerated
one.** A summary is a **READ/compose**: it emits nothing externally,
mutates no state, and discloses nothing to anyone but the requesting user.
`digest.js` audits *attempt-before-send* because a digest is a **SEND**
(`HUMAN_APPROVAL_RULES` rule 1) — for an external-effect action, "did it go
out?" is ambiguous and consequential, so you record the attempt even if the
send later fails. A summary has no such ambiguity: if `adapter.summarize`
throws, **nothing happened** — no partial effect, no state change, no
disclosure. Emitting an "attempted/produced summary" event in that case
would record a summary that never occurred — itself a small no-invention
violation, and it would falsely stamp `generationMode: "llm"` on a
non-event. No invariant requires a pre-attempt event for a read (invariant
3 governs deletes; invariant 4 governs *what* metadata may hold, not
*when*). QA probe (d2) and the test at `summary.test.js:205-211` confirm
**zero** `items.summarized` events on throw — the right behaviour. The
engineer's deviation-3 reasoning is sound.

**Caveat handed to rule-5 (advisory 2):** this verdict is scoped to a read
with no external effect. The moment a real model sits behind the adapter,
`adapter.summarize` becomes a **billable, external-effect call**, and
"audit only after it returns" would silently fail to record a model call
that spent tokens but then threw during response handling. At that point
the audit strategy must move toward `digest.js`'s attempt-then-final shape
(or at minimum record token spend on failure). Correct today; a named
precondition for tomorrow.

## Agentic-threats scan (OWASP ASI Top 10, 2026)

**Characterising the agentic surface: essentially inert.** No real model
executes. No tool calls — `summarize(items)` takes an array and returns
`{text, snippet}`; it invokes nothing, executes nothing derived from item
content. No persisted agent memory/state — `summary.js` is stateless. Item
`content` is treated purely as **data**: in the deterministic path it is
sliced to ≤80 chars and echoed verbatim back to the **same** user; it is
never parsed as an instruction, fed to a model, or used to select a branch
or a tool.

**No OWASP ASI risk is live today.** Mapping the ones that would otherwise
apply:

| ASI risk | Live today? | Why / deferral |
|---|---|---|
| Prompt / goal injection via untrusted content | **No** | No prompt and no model exist to inject into; content is data echoed to its owner. Becomes relevant at rule-5, but blast radius is self-directed (a user's own content summarised back to only themselves) — harden prompts, but low severity. |
| Tool misuse / excessive agency | **No** | No tools, no actions, no autonomy — the function composes a string and can do nothing else. |
| Sensitive-information disclosure | **No** (foreclosed) | User-scoping (inv. 5) + no-content-in-logs (inv. 4). Snippet is the user's own content to the user. At rule-5, sending content to a third-party model is a **new data flow** — see precondition 4. |
| Unbounded consumption / cost | **No** | Deterministic, zero tokens, O(n) with an 80-char cap; FinOps confirmed $0 live. Token cost + kill-switch are rule-5 preconditions (FinOps 04). |
| Memory / context poisoning | **N/A** | No persisted agent memory. |
| Misinformation / hallucination | **No** (foreclosed for count) | `itemCount` clamped to ground truth; free-text invention guard is a rule-5 precondition (AI-risk 03, finding 1). |

Nothing to fix in this slice. Every ASI concern is a property of the future
real-model path and is captured as a rule-5 precondition below.

## Preconditions for the future rule-5 (real-model) slice

These must be satisfied **before** a real model is wired behind
`PlaceholderLlmSummarizer`'s replacement. Whoever picks up rule-5 should
treat this list as a gate, and **re-run the AI-risk assessment in full**
(tier included — Governance flags a likely move to EU AI Act *Limited* with
Art. 50 transparency duties attaching):

1. **Free-text invention guard.** The `itemCount` clamp does **not** extend
   to a model's free-text `text`/`snippet`. Add a structural check that
   rejects/flags any adapter `snippet` that is not a verbatim substring of
   real item content, and/or stand up an adversarial invention-detection
   eval. (AI-risk 03, finding 1 — required-fix, gates rule-5.)
2. **Golden set + eval-refresh cadence.** Neither exists today (correctly —
   nothing generative to score or drift). Both must exist before generation
   is real, with a mandatory re-run trigger on model-version or prompt
   change. (AI-risk 03, finding 2.)
3. **Cost kill-switch + per-summary token budget.** (FinOps 04.) A real
   model turns this from $0 to per-call spend on an unbounded-length
   `content` field; a hard cap and a kill-switch are required before live
   inference.
4. **New-subprocessor / data-flow review (HUMAN_APPROVAL_RULES rule 6).**
   Routing user `content` to a hosted model provider is a **new external
   data flow and data-processor onboarding**, not just a code change. Run
   `templates/VENDOR_RISK_TEMPLATE.md`, surface the processor + data
   classification + DPA status, and obtain the human approval *before*
   wiring — separate from, and in addition to, the rule-5 model-wiring
   approval.
5. **Audit strategy revisit (this review, advisory 2).** Move
   `items.summarized` toward attempt-then-final (or record token spend on
   failure) once the adapter call becomes a billable external effect.
6. **Prompt-injection hardening.** Treat item `content` as untrusted when
   it enters a prompt; ensure a crafted `content` cannot redirect the
   summariser's instruction or exfiltrate system-prompt context.
7. **Fresh rule-5 approval + re-tier.** `APPROVAL_RECORD-1.md` approved the
   placeholder seam **only**; live inference is explicitly deferred and
   needs its own approval knowing the ongoing token spend and data flow.

## Recommendation

- [x] **Pass to Release Manager.** Deterministic-first, real-data-only,
      user-scoped, content-free audit trail, unconditionally-throwing LLM
      seam that is never constructed or wired in production. Invariants 4,
      5, and 6 all hold — verified structurally and (via QA's probe)
      at runtime. No secret, no PII leak, no approval bypass, no silent
      model wiring, no weakened audit event.
- [ ] Block.

## Hand off

To the **Release Manager**. Verify `APPROVAL_RECORD-1.md` (rule-5 scope =
placeholder seam only) against the shipped diff — already independently
confirmed here: no real model / network / keys. Ship at Tier 2. Carry the
seven rule-5 preconditions above forward as the gate for the future
real-model slice.

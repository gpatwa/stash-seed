# Post-Launch Review — email-digest

> Owner: Post-Launch Learning Agent
> Tier: 3
> Released at: 2026-07-14, merge commit `185d3ac` (PR #2, `slice/email-digest` → `main`)
> Source PRD: none formal — `runs/email-digest/00-slice-plan.md` (Intake) +
> `runs/email-digest/01-em-scope.md` (Scope) stand in for it; Discovery/PM was
> compressed out at intake as an internal, well-understood ask
> (`01-em-scope.md` "Stage/compression decision").

## Signal basis

This seed has no runtime users, so "production signal" here means: the test
suite (27/27 — `test/digest.test.js` + unmodified `test/savedItems.test.js`),
the QA Evidence agent's independent runtime probe (`04-qa-evidence.md`,
sections a–e, written from scratch against the real modules), the Security &
Privacy agent's independent greps/checks (`05-security-review.md`), and the
pipeline's own Trace telemetry (`STATE.md`). No usage/error/feedback data
exists and none is claimed below.

I also independently re-ran the two `06-release-checklist.md` "post-launch
monitoring" signals directly against landed `main` (post-merge, not the
pre-merge PR branch): `grep -rn "Adapter" src/` still shows only
`PlaceholderEmailAdapter`; `grep -rn "sendItemsDigest"` shows zero callers
outside `test/digest.test.js` (no route/cron/UI invokes it); a network/env
seam grep (`process.env|http|https|smtp|nodemailer|axios|fetch`) over `src/`
is empty; `npm run qa:mvp` is green (27/27) on `main`. `items.digest_sent`
remains structurally unreachable on landed `main`, and no unexpected
`items.digest_send_attempted` caller exists.

## Success criteria — did we hit them?

| Criterion | Met? | Evidence |
|-----------|------|----------|
| "Digest composed correctly for a user's items (unit-tested)" (`00-slice-plan.md`) — capability built | yes | `composeDigest` is pure/deterministic; T-C1–T-C3 pass (N-item, empty-input, determinism); independently re-driven by QA probe (d)/(e). `04-qa-evidence.md`, `03-impl-notes.md`. |
| "The placeholder adapter throws by default — no silent send" (`00-slice-plan.md`) — placeholder throws | yes | T-A1/T-A2/T-S1 pass; QA probe (a)/(b) differential independently proves the placeholder — not some other code path — blocks the send; Security check 3: no network/env/config seam anywhere in `src/`, only `PlaceholderEmailAdapter` is ever constructed, `items.digest_sent` structurally unreachable. Re-confirmed by me directly on landed `main` (see Signal basis). |
| "The action is audited; user-scoped" (`00-slice-plan.md`) — audited | yes | `items.digest_send_attempted` fires exactly once, unconditionally, before `adapter.send` (T-S2/T-S3); metadata is `itemIds`/`itemCount`/`recipientHash` only (T-S3/T-S4, QA probe (c) with a seeded secret string + realistic recipient). Security check 4 independently confirms no fake-success trail. |
| "The action is audited; user-scoped" (`00-slice-plan.md`) — user-scoped | yes | `sendItemsDigest` reads via `listItems(userId)` (already scoped); `composeDigest` takes no `userId` at all, so it cannot re-scope. T-S5/T-S6 + QA probe (d): u1's digest never includes u2's items, u2's audit log shows zero digest events. Security check 5 concurs. |
| Pipeline executed as a single, confirmed run (process integrity — first real Tier-3 slice) | yes* | One commit (`09bd4c4`), one PR (#2), one merge (`185d3ac`); 0/2 retries on every stage (`STATE.md` Failure budget); Release Manager independently re-verified shipped-diff scope matches the approved rule-1 scope exactly (`06-release-checklist.md` "Approval verification," points 1–5). *Caveat: the Tier-3 token-budget SLO was missed (504k vs ≤400k) — doesn't affect correctness or the GO decision, but isn't swept under "yes" silently; see Surprises / Process carry-forward. |

EM's five measurable success criteria (`01-em-scope.md` SC1–SC5) map 1:1 onto
the rows above and are each independently test-cited: SC1→T-C1/T-C3,
SC2→T-A1/T-S1, SC3→T-S2/T-S3/T-S10, SC4→T-S5/T-S6, SC5→T-R1 (unmodified
12/12 `savedItems.test.js`).

## Surprises

| Surprise | Signal cited | Severity |
|----------|--------------|----------|
| Tier-3 token-SLO missed on its first real data point: 504,352 vs ≤400k target (26% over). | `STATE.md` Trace table + SLO-check line ("Tier-3 token budget MISSED — 504k vs ≤400k target… target was baselined on a 4-stage Tier-2 run"). | medium |
| The overage traces to stage *count* (6 vs. the 4-stage baseline), not a per-stage opus premium: this run's 3 opus stages averaged 80,505 tokens/stage — actually *below* the 3 sonnet stages' 87,613 tokens/stage average. The SLO doc's own assumption ("opus stages cost more") isn't what drove the miss here. | Arithmetic on `STATE.md` Trace token column: opus = Architecture 83,434 + Security 70,034 + Release 88,046 = 241,514; sonnet = Scope 74,191 + Implementation 92,740 + QA 95,907 = 262,838. | low |
| The human-approval interrupt held correctly across a 28-day, multi-session gap (Intake opened 2026-06-15T17:20Z, approved 2026-07-13T06:04Z) — no drift, no silent auto-approval, no state loss. But it also means the aggregate "Lead time" DORA metric (`PIPELINE_SLOS.md`: "Intake row start → slice landed") will blend human-approval-wait time with active pipeline time unless the two are reported separately. | `STATE.md` Trace, Intake row ("interrupt held across sessions"); `APPROVAL_RECORD-1.md` timestamp vs. slice Started timestamp. | low-medium |
| EM flagged mid-run that `.agentic/CURRENT_MVP_STATUS.md` was stale (listed already-shipped `bulkDeleteItems` as "not yet built"), explicitly scoped out as out-of-scope for this slice to fix. It was corrected anyway, in the same landing commit. | `01-em-scope.md` "Flag for the Orchestrator"; `git show b178612 -- .agentic/CURRENT_MVP_STATUS.md` (commit message: "Also refreshes the stale CURRENT_MVP_STATUS the EM flagged"). | low (positive — flag-to-fix loop worked end to end) |

## What we'd do differently

- Treat a tier's *first* real SLO measurement as a calibration run, not a
  pass/fail gate — the 400k Tier-3 target was extrapolated from a
  different tier's data (Tier-2, 4 stages) and was never going to be
  reliable until a real Tier-3 sample existed.
- Report human-approval-wait time separately from active pipeline
  wall-clock in `STATE.md`/aggregate DORA rollups, so a long approval gap
  (28 days here) doesn't get blended into "Lead time" the way it currently
  would under `PIPELINE_SLOS.md`'s definition.

## Carry-forward to next PRD

**Process (pipeline SLO) — recommendation on the token-budget miss:**

**Re-baseline the Tier-3 token budget from this run's 504,352-token data
point; don't reach for prompt-slimming as the fix.** Rationale:
1. The existing 400k target was extrapolated from a 4-stage Tier-2 run,
   never measured on Tier 3 — this is the first real sample, and it's a
   26% miss on a target that was a guess, not a measurement.
2. The 6-stage / 3-opus shape is structural to Tier 3, not an outlier:
   the full stage list is mandatory (`01-em-scope.md`: "QA and Security:
   full, not compressed… cannot be shortened for speed") and opus routing
   for Architect/Security/Release is unconditional at this tier
   (`MODEL_ROUTING.md` Layer 2). Every future Tier-3 slice will carry this
   same shape.
3. This run's own numbers (see Surprises) show opus stages were *not* the
   token driver — targeted prompt-slimming aimed at "expensive opus
   stages" wouldn't address the real cause (stage count), and slimming the
   judgment-heavy stages generally risks cutting the evidentiary depth
   Tier 3 exists to buy (independent QA probes, Security's six independent
   checks, Release Manager's full gate walk).
4. Per `PIPELINE_SLOS.md` "Changing targets," this can't be a silent
   loosening. This review records the recommendation and rationale;
   treats the number as **provisional (n=1)** pending 2–3 more Tier-3
   samples; and leaves the actual edit to `PIPELINE_SLOS.md` to the
   Orchestrator/human — that's a standing-config change outside what
   Post-Launch owns. Suggested check-in point: after the next Tier-3
   slice (likely the rule-6 provider slice) lands.

**Product (email-digest / rule-6 slice):**
- The deferred rule-6 slice (real email provider) needs its own fresh
  rule-6 **and** rule-1 approval — this slice's rule-1 approval is
  placeholder-scoped and does not carry over — and must clear all six
  hard preconditions before it ships (`05-security-review.md`,
  `06-release-checklist.md`):
  - **P-1** vendor risk assessment + DPA status
    (`templates/VENDOR_RISK_TEMPLATE.md`) — a real provider is a new
    third-party data processor.
  - **P-2** salt (or drop) `recipientHash` — currently an **unsalted**
    SHA-256 of the raw recipient, truncated to 12 hex chars / 48 bits
    (`src/services/digest.js:53-55`, confirmed by direct read). Acceptable
    only because no real address flows today; offline-reversible
    (dictionary/rainbow) the moment one does. Non-negotiable before real
    addresses are hashed this way.
  - **P-3** the real adapter must independently honour invariant 4 (no
    content/PII in its own logs, errors, retries, telemetry) — today's
    guarantee rests entirely on the placeholder throwing before it gets
    that far.
  - **P-4** an explicit per-send approval gate at whatever call site is
    added — not a standing config/flag.
  - **P-5** provider config must fail closed (throw on missing/invalid
    config; secrets from env/secret-manager only).
  - **P-6** re-audit send semantics under a real provider (attempted-
    before-send ordering; no optimistic/fake `digest_sent`).
- Nothing calls `sendItemsDigest` yet — confirmed directly on `main`, zero
  callers outside `test/`. Whoever adds a trigger needs to design that
  call site with P-4 in mind from the start.
- No user/email-directory subsystem exists; `recipient` is currently a
  bare caller-supplied string (deliberate, per `01-em-scope.md`, to avoid
  building profile infrastructure prematurely). A real trigger needs to
  decide where the recipient address actually comes from — a new
  PII-storage question, separate from the provider question.
- Explicit non-goals of this slice — scheduling/cadence (cron),
  unsubscribe management, HTML template polish (`00-slice-plan.md`) — are
  all still fully unbuilt. Unsubscribe management in particular should be
  treated as a likely hard precondition (not just a nice-to-have) for any
  automated/non-manual send trigger, not only for the provider swap.
- `items.digest_sent` is intentionally unreachable-by-design today
  (Decision 1, `02-architecture.md`) — the rule-6 slice's job is to make
  it reachable by swapping the adapter, not to redesign audit semantics.
  Worth telling the next Architect explicitly so it isn't re-litigated.

## Follow-up slices to file

- [ ] Rule-6 slice: wire a real email provider, gated on fresh rule-6 +
      rule-1 human approval and preconditions P-1..P-6 (`05-security-review.md`).
- [ ] Add a trigger (route/cron/manual action) for `sendItemsDigest`,
      designed with the P-4 explicit per-send approval gate from the
      start — nothing invokes it today.
- [ ] Recipient/email-directory resolution — decide where a real
      recipient address is stored/sourced (new PII-storage design
      question, distinct from the provider question).
- [ ] Digest cadence/scheduling (cron) — explicit non-goal of this slice,
      still needed for a real product feature.
- [ ] Unsubscribe management — explicit non-goal of this slice; likely
      required before any automated (non-manual) trigger ships.

## Hand off

Next agent: Orchestrator. The Orchestrator decides whether to surface these
carry-forward items — especially the Tier-3 SLO re-baseline recommendation
and the rule-6 preconditions — to the human now or fold them into the next
slice's intake silently. The rule-6 slice remains **not requested**; it
starts only on a fresh human ask.

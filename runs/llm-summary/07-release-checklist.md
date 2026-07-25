# Release Checklist — llm-summary

> Owner: Release Manager Agent (opus)
> Tier: **2** (behavioural change, no external effect)
> Decision: **GO** — lands via human-performed PR merge (see Decision + "Who merges")
> Source artefacts (all under `runs/llm-summary/`): `00-slice-plan.md`,
> `01-em-scope.md`, `02-impl-notes.md`, `03-ai-risk.md`, `04-cost-budget.md`,
> `05-qa-evidence.md`, `06-security-review.md`, `APPROVAL_REQUEST-1.md`,
> `APPROVAL_RECORD-1.md`, `STATE.md`.
> Shipped commit: `9c96bdd85b4721af2e2f0bfdc9a928ac530aa300` on branch
> `slice/llm-summary` (parent `f10b382`). Independently re-confirmed by the
> Release Manager via `git show --name-status 9c96bdd` (see "Approval
> verification").

## Tier classification rationale

**Tier 2 is correct.** This slice adds a new backend capability
(`summarizeItems(userId, adapter?)`) that reads the caller's own items via the
unmodified, user-scoped `listItems`, composes a deterministic string, and emits
one `items.summarized` audit event. It is a *behavioural change with no external
effect*: no send/submit/post/publish/push/deploy/destroy, no third-party
integration, no auth/permissions change. The LLM seam
(`PlaceholderLlmSummarizer`) is an **inert, unconditionally-throwing
placeholder** — it makes no model call, no network call, holds no keys, and is
never auto-constructed in `src/` (only `new DeterministicSummarizer()` is, at
`summary.js:127`). It is also unwired (no route/cron), so the LLM path is doubly
unreachable. That rules out Tier 3 (external-effect) and rules out Tier 1
(this is a new behavioural capability, not a doc/refactor/test-only change).

**Future note:** replacing the placeholder with a real model would be **Tier 3
+ rule 5 + rule 6** — it creates ongoing token spend and a new external data
flow (user `content` → hosted model provider). It must re-run the full gate set
and the AI-risk assessment (Governance flags a likely move to EU AI Act
*Limited* with Art. 50 transparency duties). See "Standing gate: rule-5
preconditions" below.

## Gates

Tier-2 gates walked top-to-bottom from `docs/RELEASE_GATES.md`, each marked
pass / n/a-with-reason, citing the proving artefact.

### Scope

- [x] Slice fits in one implementation pass — EM accepted as a single Tier-2 slice; implemented in one commit, green on first try (`01-em-scope.md`; `02-impl-notes.md` "0/2 retries").
- [x] Non-goals are explicit — real-model wiring, streaming, persistence changes are named non-goals (`00-slice-plan.md` Non-goals; `01-em-scope.md` "Deferred: real-model wiring").

### Discovery / success criteria

- [x] Success criteria are observable — deterministic summary correct and never-inventing; placeholder throws; evals green; user-scoped; audit carries `generationMode`. All are testable and tested (`00-slice-plan.md`, `01-em-scope.md`; verified in `05-qa-evidence.md`). *No separate PM/PRD stage — compressed into the slice plan for this headless seed; success criteria live in 00/01.*

### Architecture

- [x] Adapter boundaries identified — `SummarizerAdapter` interface with `DeterministicSummarizer` (default) + `PlaceholderLlmSummarizer` (throws). *No separate Architect stage: per `01-em-scope.md` the AI Engineer owns the deterministic-vs-LLM split (`agents/ai-engineer.md`), documented in `02-impl-notes.md`.*
- [x] Audit / usage events listed — `items.summarized` with `{ itemCount, generationMode }`, IDs/counts only (`01-em-scope.md`; `02-impl-notes.md`; confirmed in `06-security-review.md`).

### Implementation

- [x] Typecheck passed — `typecheck ok` (`02-impl-notes.md`; independently re-run in `05-qa-evidence.md` step 1).
- [x] Targeted tests passed — `node --test test/summary.test.js` → 14/14 (`05-qa-evidence.md` step 2).
- [x] Full test suite passed — 49/49, 0 fail/skip/todo; 35→49 (+14) with all pre-existing tests unmodified (`02-impl-notes.md`; independently reproduced in `05-qa-evidence.md` step 3).
- [x] Build passed — `build ok` (`05-qa-evidence.md` step 4).
- [x] One commit per task — the slice's implementation is the single commit `9c96bdd`; verified via `git show --name-status`. (Later commits on the branch, e.g. `f9d9dc8` "Security PASS", are pipeline-state/artefact commits by the agents, not implementation tasks.)
- [x] No new lint warnings (`git diff --check`) — `git diff --check` and `git show 9c96bdd --check` both exit 0, no output (`05-qa-evidence.md` step 6).

### QA

- [n/a] UI verified in preview where observable — **n/a: backend-only slice.** `summarizeItems` has no route/UI/cron; `grep summary src/server.js` returns nothing (`05-qa-evidence.md` "UI verification"; `06-security-review.md`). Nothing observable to preview or screenshot.
- [x] Local regression command passed (`npm run qa:mvp`) — green; typecheck ok + 49/49 (`05-qa-evidence.md` step 5).
- [x] Safety invariants verified — invariants **4** (no item content in logs) and **5** (user only affects own items) apply and both hold, verified structurally and at runtime (QA probe (b)/(c); `06-security-review.md`). Invariants 1–3 (deletes) are untouched by this read-only slice and re-confirmed unaffected (QA probe (e)). *Invariant-numbering note: QA (`05`) correctly refused to fabricate a citation for a nonexistent "invariant 7"; Security (`06`) records that the LLM-adapter-throws + no-invention discipline is now codified as **invariant 6** and verified against `.agentic/SAFETY_INVARIANTS.md`. Resolved, not a defect.*

### Security

- [x] No secrets / credentials in diff — regex sweep found no credentials; every "secret" hit is a planted test-marker bait string; no `.env`/credential file/lockfile change (`06-security-review.md`; re-confirmed by RM: no `package.json`/`package-lock.json` change in `9c96bdd`).
- [x] No PII / sensitive data logged — audit event carries only `{ itemCount, generationMode }`; no `console.*`, no `process.env`, no logging path in `summary.js`; whole-event `JSON.stringify` substring check against a planted marker passes (invariant 4; `05`/`06`).
- [x] Audit events cover state changes — the only record-emitting action is `items.summarized`, emitted on success; no other side-effecting action exists (read/compose only); no pre-existing audit event removed/renamed/weakened (`06-security-review.md`). Audit-only-on-success is the *correct* choice for a READ (Security concurs; a throw means nothing happened, so auditing it would itself be an invention).
- [x] Adapter boundary placeholder still throws — `PlaceholderLlmSummarizer.summarize()` throws unconditionally, no config/env/arg suppresses it, and it is never auto-constructed in `src/` (test-only). Re-verified by Security greps and re-run (`06-security-review.md`; maps to invariant 6).

### Release

- [x] Human approval points satisfied — see "Approval verification" below. Rule-5 approval (placeholder-seam scope) obtained *before* implementation began; no other rule 1–6 action ships in this diff; deferred rule-5 (real model) explicitly **not** granted.
- [x] Rollback plan exists — see "Rollback plan" below; confirmed executable against the actual diff.
- [x] Release checklist filled — this document.

### AI overlay & governance gates (applied per `docs/RELEASE_GATES.md` "Enterprise & governance gates")

- [x] **AI capability risk-tiered; obligations met** — EU AI Act tier **Minimal**; all Minimal-tier obligations met (transparency, human oversight, robustness, documentation, logging — evidence table in `03-ai-risk.md`). NIST AI RMF / ISO 42001 / ISO 42005 framing included; `03` self-serves as the ISO 42005 impact assessment.
- [x] **Eval coverage for AI safety invariants** — all four named invariants (no-invention, user-scoping, content-not-logged, placeholder-throws) covered by **both** structural enforcement and eval, for the code path that executes today (`03-ai-risk.md` "Eval coverage"; `05-qa-evidence.md`). Registered eval gaps are for the *future* rule-5 slice, not blockers here.
- [x] **Cost-per-action estimated** — deterministic path **$0 live today**; future LLM path modelled at ≈$0.0017–$0.0051/summary with sensitivity tiers (`04-cost-budget.md`).
- [n/a → future-blocker] **Kill-switch tested** — **n/a for this slice:** there is no billable/external code path to test (the LLM adapter throws; live cost-risk is $0). The kill-switch is *designed and on record* (`04-cost-budget.md` "Kill-switch / circuit-breaker") but cannot be tested until a real model exists. FinOps records this as a **blocking requirement on the future rule-5 slice**, not this one — carried into "Standing gate" precondition 3.
- [x] **Threat model for new attack surface** — no new *external* attack surface (capability unwired, no network, no route). Security ran a proportionate OWASP ASI Top-10 (2026) agentic-threats scan and found **no live agentic risk** — the surface is inert; every ASI concern is a property of the future real-model path and is captured as a rule-5 precondition (`06-security-review.md` "Agentic-threats scan").

#### Governance gates not engaged for this slice (n/a with reason)

Per `01-em-scope.md`'s Tier-2 gate map (Implementation + QA + Security + Release checklist, with AI Governance + FinOps as the engaged overlay roles), the heavier enterprise overlay roles are not triggered by this Minimal-risk, no-external-effect, no-new-data, no-runtime-surface slice:

| Gate | Owner | n/a reason |
|------|-------|------------|
| New data classified + retention set | Data Governance | No new data type or store; reuses in-memory `savedItems` unmodified; no persistence change (`00` non-goals). |
| Catalog / RoPA updated | Data Governance | No new data flow — read-only, same-user, no third party. |
| Schema / data migration plan + rollback | Backend Architect + Data Gov | No schema or migration; `savedItems.js` untouched; no DB. |
| Controls mapped + evidence; named approver (CAB) | Compliance Reviewer | No CAB for a Minimal-risk Tier-2 internal slice with no external effect; `03` carries the ISO 42005 impact assessment / ISO 42001 control-mapping input; the applicable human gate (rule 5) is recorded in `APPROVAL_RECORD-1.md` (approver: gpatwa). |
| New subprocessor risk-assessed + DPA | Compliance Reviewer | No subprocessor — no third-party model/network. Carried forward as rule-6 precondition 4. |
| Docs match shipped behaviour; migration notes | Tech Writer | Headless seed, no user-facing docs; artefacts are the record. (Cosmetic "20 tests" vs actual 14 in `02` is advisory-only, flagged by `03`/`05`/`06`; no code impact.) |
| SLOs + runbook + tested rollback (production service) | SRE | Not a production service with a runtime surface; capability unwired; no deploy in this run. |
| Change request recorded + approved (CAB) | Release Manager | Not triggered for this tier/risk; the human gate that *did* apply (rule 5) is recorded in `APPROVAL_RECORD-1.md`. |

### Tier 3-only gates (from the template — all n/a; this is Tier 2)

- [n/a] Human approval per `HUMAN_APPROVAL_RULES.md` (Tier-3 *external-effect* gate) — **n/a: no external effect ships.** (Distinct from the rule-5 "inviting an LLM into a deterministic path" approval that *did* apply at intake and is satisfied — see below.)
- [n/a] Dry-run passed on fixture — n/a: no external effect to dry-run. (QA's in-process runtime probe exercised the real modules end-to-end anyway; `05` "Runtime probe".)
- [x, though not required at Tier 2] Audit event coverage manually verified — Security manually verified it (`06` "Audit-coverage" section).
- [n/a] Post-launch monitoring plan — n/a at Tier 2; `03` records drift monitoring is N/A today (deterministic, cannot drift) and becomes required once a real model is wired.

### Skipped gates

None skipped without reason. Every gate above is either **passed** or **n/a with a one-line reason**. No release blocker.

## Approval verification (critical)

**Result: VERIFIED — approval is explicit, matches the shipped diff scope, and the deferred rule-5 is clearly recorded as NOT granted.**

1. **Explicit and unambiguous.** `APPROVAL_RECORD-1.md`: Decision **APPROVED**; approver **the human operator (gpatwa)** via the driving session's approval prompt; when **2026-07-24T00:10Z**; human response verbatim **"Approve"**. This is a direct yes to the specific request in `APPROVAL_REQUEST-1.md`, not an inferred "looks good."
2. **Obtained before implementation began** (rule 5's requirement). Approval 00:10Z vs implementation start 00:13Z (`STATE.md` Trace). Correct ordering.
3. **Scope matches the shipped diff exactly.** Approved scope = build the summary *deterministic-first* behind a `SummarizerAdapter` seam whose LLM placeholder *throws by default*, plus evals + AI-risk + cost model; **"no real model, no network, no keys."** Independently confirmed by the Release Manager against commit `9c96bdd` (`git show --name-status`): 2 added source/test files (`src/services/summary.js`, `test/summary.test.js`), `scripts/build-check.mjs` +1 line, 2 run-artefacts; **no** `.env`/credential file, **no** `package.json`/`package-lock.json` change (no new dependency). Matches Security's independent finding (`06`). The shipped diff is precisely the approved scope — deterministic-first + throwing placeholder only.
4. **Deferred rule-5 clearly NOT granted.** `APPROVAL_RECORD-1.md` "Explicitly NOT approved (deferred): wiring a real model / provider or enabling live inference — a separate rule-5 approval when a provider + keys are chosen." `STATE.md` Approvals table records this second action as "not yet / deferred / —". No pre-clearance exists for the real model.
5. **No other rule 1–6 action ships in this diff** (checked against the diff, not assumed):
   - Rule 1 (send/submit) — none: capability is unwired, no route, no send.
   - Rule 2 (destructive op) — none: read-only, no delete path (`grep delete summary.js` → nothing).
   - Rule 3 (deploy/release/flag) — none in this run (see "Who merges").
   - Rule 4 (change to safety controls) — none: no gate/audit disabled; the placeholder still throws; no `--no-verify`.
   - Rule 5 (LLM into deterministic path) — the throwing placeholder seam only, and it is approved.
   - Rule 6 (new subprocessor / data flow) — none: no network, no third party.

## Rollback plan

Lifted from `02-impl-notes.md` "Rollback", confirmed by the Release Manager against the actual diff:

1. **One-shot:** `git revert 9c96bdd` — reverts the implementation commit. Confirmed executable: the two rollback-surface files (`src/services/summary.js`, `test/summary.test.js`) are present, the commit is well-formed, and the later branch commits touch only `runs/` artefacts (not the summary source), so the revert applies cleanly with no conflict.
2. **Manual equivalent:** delete `src/services/summary.js` and `test/summary.test.js`, and revert the single `"../src/services/summary.js"` line added to `scripts/build-check.mjs`'s `modules` array.
3. **Confirm clean:** `grep -rn "Summarizer\|summarizeItems" src/ test/` returns nothing → rollback complete. No dependency, migration, or data change to unwind (nothing in `package.json`/lockfile or `savedItems.js`).

## Post-launch monitoring (Tier 3)

Not applicable at Tier 2. `DeterministicSummarizer` is pure, stateless, and cannot drift (`03-ai-risk.md`). Drift / hallucination-rate / output-length monitoring becomes required once a real model is wired (carried into the standing gate).

## Standing gate: rule-5 preconditions for the FUTURE real-model slice

Carried forward verbatim from `06-security-review.md` (re-affirming `03-ai-risk.md` + `04-cost-budget.md`). These are **NOT** required for this slice; they are the gate the future rule-5 (real-model) slice must clear before a real model is wired behind `PlaceholderLlmSummarizer`'s replacement. That slice must also **re-run the AI-risk assessment in full (tier included).**

1. **Free-text invention guard** — the `itemCount` clamp does not extend to a model's free-text `text`/`snippet`; add a structural verbatim-substring check and/or an adversarial invention-detection eval. (`03` finding 1 — required-fix, gates rule-5.)
2. **Golden set + eval-refresh cadence** — neither exists today (correct); both required before generation is real, with a mandatory re-run trigger on model-version or prompt change. (`03` finding 2.)
3. **Cost kill-switch + per-summary token budget** — implemented **and tested** (per-request cap, rate limit, fleet-wide spend cap, all falling back to `DeterministicSummarizer`) before any live inference. (`04` — blocker scoped to the future slice.)
4. **New-subprocessor / data-flow review (rule 6)** — run `templates/VENDOR_RISK_TEMPLATE.md`, surface the processor + data classification + DPA status, and obtain a separate human approval *before* wiring.
5. **Audit strategy revisit** — move `items.summarized` toward attempt-then-final (or record token spend on failure) once the adapter call becomes a billable external effect.
6. **Prompt-injection hardening** — treat item `content` as untrusted when it enters a prompt; ensure crafted `content` cannot redirect the summariser or exfiltrate system-prompt context.
7. **Fresh rule-5 approval + re-tier** — `APPROVAL_RECORD-1.md` approved the placeholder seam only; live inference needs its own approval (knowing ongoing token spend + data flow) and a re-tier (likely EU AI Act *Limited*, Art. 50 transparency attaching).

## Decision

- [x] **Go** — the slice is cleared to land. All Tier-2 gates pass or are n/a-with-reason; rule-5 approval verified and scope-matched; no other gated action in the diff; rollback confirmed executable; AI-risk **Minimal** with obligations met; live cost-risk **$0**.
- [ ] **No-go.**

### Who merges (rule-3 stays with the human)

**"Landing" = merging branch `slice/llm-summary` into `main` via PR, and it is performed by the HUMAN, not this run.** Merging to the default branch is a rule-3 deploy-adjacent action (`docs/HUMAN_APPROVAL_RULES.md`). The Release Manager's output is the GO decision + this checklist only — **the run does not merge, push, or deploy.** The GO authorises the human to perform the merge; it does not authorise any agent to perform it.

## Hand off

- **On merge (human-performed):** to the Post-Launch Learning Agent, once the slice has produced any observable signal. (For this backend-only, unwired capability the observable signal is limited to `items.summarized` audit events if/when a caller invokes it.)
- **Future real-model slice:** starts from the "Standing gate" above; whoever picks up rule-5 treats it as the entry checklist and re-runs `03-ai-risk.md` in full.

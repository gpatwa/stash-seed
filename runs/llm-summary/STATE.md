# Slice State — llm-summary

- **Ask:** Give users an AI-generated summary of their saved items.
- **Project pack:** b2c-saas (with AI overlay roles)
- **Release tier:** 2 (deterministic-first build; real model would be Tier 3)
- **Current stage:** Security
- **Status:** in-progress
- **Started:** 2026-07-24T00:00Z  ·  **Updated:** 2026-07-24T18:25Z

## Stages

| Stage | Owner | Status | Artefact | Gate |
|-------|-------|--------|----------|------|
| Intake | Orchestrator | done | runs/llm-summary/00-slice-plan.md | n/a |
| Scope | Engineering Manager | done | runs/llm-summary/01-em-scope.md | — |
| Implementation | AI Engineer | done | runs/llm-summary/02-impl-notes.md | — |
| AI risk | AI Governance | done | runs/llm-summary/03-ai-risk.md | Minimal · pass |
| Cost | FinOps | done | runs/llm-summary/04-cost-budget.md | $0 live · pass |
| QA | QA Evidence | done | runs/llm-summary/05-qa-evidence.md | 49/49 · pass |
| Security | Security & Privacy | pending | — | — |
| Release | Release Manager | pending | — | — |

## Approvals

| Action | Rule | Requested | Decision | Approver | When (UTC) | Record |
|--------|------|-----------|----------|----------|-----------|--------|
| Build the deterministic-first summary + throwing LLM placeholder + evals | 5 | yes | **APPROVED** | gpatwa (human) | 2026-07-24T00:10Z | runs/llm-summary/APPROVAL_RECORD-1.md |
| Wire a real model / provider + enable live inference | 5 | not yet | deferred | — | — | — |

## Failure budget

Class per `FAILURE_LOOP.md` "Failure categories".

| Stage | Retries used | Cap | Class | Last failure |
|-------|--------------|-----|-------|--------------|
| — | 0 | 2 | — | — |

> Note: the AI Governance + FinOps stages were interrupted once by an account
> session usage limit (no output produced) and re-run after reset — an
> infrastructure pause, not a slice failure, so not counted against the
> retry budget. The run resumed cleanly from this file.

## Trace

Model routing (Tier 2): AI Engineer / AI Governance / FinOps / QA = sonnet;
Security / Release = opus (`.claude/protocols/MODEL_ROUTING.md`).

| Stage | Model | Start (UTC) | End (UTC) | Wall | Tokens | Tool calls | Retry # |
|-------|-------|-------------|-----------|------|--------|------------|---------|
| Intake (paused for approval) | fable (driving) | 2026-07-24T00:00Z | 2026-07-24T00:10Z | interrupt held | n/a | n/a | 0 |
| Scope (EM) | fable (driving) | 2026-07-24T00:11Z | 2026-07-24T00:12Z | ~1m | n/a | n/a | 0 |
| Implementation (AI Engineer) | sonnet | 2026-07-24T00:13Z | 2026-07-24T00:22Z | 9:01 | 117,247 | 46 | 0 |
| AI risk (AI Governance) | sonnet | 2026-07-24T18:15Z | 2026-07-24T18:20Z | 4:30 | 68,648 | 7 | 0 |
| Cost (FinOps) | sonnet | 2026-07-24T18:15Z | 2026-07-24T18:21Z | 6:08 | 396,543 | 10 | 0 |
| QA (QA Evidence) | sonnet | 2026-07-24T18:26Z | 2026-07-24T18:34Z | 8:07 | 126,396 | 42 | 0 |

## Next action

Security & Privacy: read `runs/llm-summary/05-qa-evidence.md` (QA: PASS —
49/49 tests + 21/21 runtime-probe assertions) and `03-ai-risk.md`. Confirm no
secret/PII leak, no approval bypass, and that invariants 4 (no content in
logs), 5 (user-scoping), and the newly-codified 6 (AI/LLM adapters throw;
no-invention) hold. Resolution of QA's flag: the intake artefacts referenced
an "invariant 7" imported in error from the worked example's 7-invariant
list; the LLM-adapter discipline was real (AI Engineer brief + rule 5) but
uncodified in this repo — it is now added to `.agentic/SAFETY_INVARIANTS.md`
as invariant 6. Concur (or not) on the audit-ordering: `items.summarized` is
audited only-on-success, appropriate here because a summary is a READ, not a
send (unlike `digest.js`'s attempt-before-send). Then hand to Release.

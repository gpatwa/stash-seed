# Slice State — llm-summary

- **Ask:** Give users an AI-generated summary of their saved items.
- **Project pack:** b2c-saas (with AI overlay roles)
- **Release tier:** 2 (deterministic-first build; real model would be Tier 3)
- **Current stage:** AI risk
- **Status:** in-progress
- **Started:** 2026-07-24T00:00Z  ·  **Updated:** 2026-07-24T00:12Z

## Stages

| Stage | Owner | Status | Artefact | Gate |
|-------|-------|--------|----------|------|
| Intake | Orchestrator | done | runs/llm-summary/00-slice-plan.md | n/a |
| Scope | Engineering Manager | done | runs/llm-summary/01-em-scope.md | — |
| Implementation | AI Engineer | done | runs/llm-summary/02-impl-notes.md | — |
| AI risk | AI Governance | pending | — | — |
| Cost | FinOps | pending | — | — |
| QA | QA Evidence | pending | — | — |
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

## Trace

Model routing (Tier 2): AI Engineer / AI Governance / FinOps / QA = sonnet;
Security / Release = opus (`.claude/protocols/MODEL_ROUTING.md`).

| Stage | Model | Start (UTC) | End (UTC) | Wall | Tokens | Tool calls | Retry # |
|-------|-------|-------------|-----------|------|--------|------------|---------|
| Intake (paused for approval) | fable (driving) | 2026-07-24T00:00Z | 2026-07-24T00:10Z | interrupt held | n/a | n/a | 0 |
| Scope (EM) | fable (driving) | 2026-07-24T00:11Z | 2026-07-24T00:12Z | ~1m | n/a | n/a | 0 |
| Implementation (AI Engineer) | sonnet | 2026-07-24T00:13Z | 2026-07-24T00:22Z | ~9m | n/a | n/a | 0 |

## Next action

AI Governance (AI risk) + FinOps (Cost): assess the shipped `summary.js`
capability — risk tier per `AI_RISK_ASSESSMENT_TEMPLATE.md`, token
cost-per-summary + kill-switch per `COST_BUDGET_TEMPLATE.md` (even though no
real model is wired yet) — per `01-em-scope.md`'s gate map. Then
QA → Security → Release.

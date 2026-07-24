# Slice State — llm-summary

- **Ask:** Give users an AI-generated summary of their saved items.
- **Project pack:** b2c-saas (with AI overlay roles)
- **Release tier:** 2 (deterministic-first build; real model would be Tier 3)
- **Current stage:** Intake
- **Status:** blocked-on-approval
- **Started:** 2026-07-24T00:00Z  ·  **Updated:** 2026-07-24T00:00Z

## Stages

| Stage | Owner | Status | Artefact | Gate |
|-------|-------|--------|----------|------|
| Intake | Orchestrator | done | runs/llm-summary/00-slice-plan.md | n/a |
| Scope | Engineering Manager | blocked | — | — |
| Implementation | AI Engineer | pending | — | — |
| AI risk | AI Governance | pending | — | — |
| Cost | FinOps | pending | — | — |
| QA | QA Evidence | pending | — | — |
| Security | Security & Privacy | pending | — | — |
| Release | Release Manager | pending | — | — |

## Approvals

| Action | Rule | Requested | Decision | Approver | When (UTC) | Record |
|--------|------|-----------|----------|----------|-----------|--------|
| Build the deterministic-first summary + throwing LLM placeholder + evals | 5 | yes | **PENDING** | — | — | — |
| Wire a real model / provider + enable live inference | 5 | not yet | deferred | — | — | — |

## Failure budget

Class per `FAILURE_LOOP.md` "Failure categories".

| Stage | Retries used | Cap | Class | Last failure |
|-------|--------------|-----|-------|--------------|
| — | 0 | 2 | — | — |

## Trace

Model routing: Tier 2 → defaults (Architect/Security opus; others sonnet)
per `.claude/protocols/MODEL_ROUTING.md`.

| Stage | Model | Start (UTC) | End (UTC) | Wall | Tokens | Tool calls | Retry # |
|-------|-------|-------------|-----------|------|--------|------------|---------|
| Intake (paused for approval) | fable (driving session) | 2026-07-24T00:00Z | — | interrupt held | n/a | n/a | 0 |

## Next action

WAIT for the human's decision on `APPROVAL_REQUEST-1.md` (rule 5). If
approved, record it and hand to the Engineering Manager for scope, then the
AI Engineer builds deterministic-first with a throwing placeholder. If
denied, stop the slice.

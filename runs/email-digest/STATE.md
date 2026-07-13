# Slice State — email-digest

- **Ask:** Email users a digest of their saved items.
- **Project pack:** b2c-saas
- **Release tier:** 3
- **Current stage:** QA
- **Status:** in-progress
- **Started:** 2026-06-15T17:20Z  ·  **Updated:** 2026-07-13T06:22Z

## Stages

| Stage | Owner | Status | Artefact | Gate |
|-------|-------|--------|----------|------|
| Intake | Orchestrator | done | runs/email-digest/00-slice-plan.md | n/a |
| Scope | Engineering Manager | done | runs/email-digest/01-em-scope.md | — |
| Architecture | Software Architect | done | runs/email-digest/02-architecture.md | — |
| Implementation | Backend Architect | done | runs/email-digest/03-impl-notes.md | — |
| QA | QA Evidence | pending | — | — |
| Security | Security & Privacy | pending | — | — |
| Release | Release Manager | pending | — | — |
| Post-Launch | Post-Launch Learning | pending (runs after landing) | — | — |

## Approvals

| Action | Rule | Requested | Decision | Approver | When (UTC) | Record |
|--------|------|-----------|----------|----------|-----------|--------|
| Build send-on-behalf email-digest capability (placeholder adapter, no real send) | 1 | yes | **APPROVED** | gpatwa (human) | 2026-07-13T06:04Z | runs/email-digest/APPROVAL_RECORD-1.md |
| Wire a real email provider + enable real sends | 6 | not yet | deferred | — | — | — |

## Failure budget

| Stage | Retries used | Cap | Last failure |
|-------|--------------|-----|--------------|
| — | 0 | 2 | — |

## Trace

Model routing: Tier 3 → Architect/Security/Release = opus; others sonnet
(`.claude/protocols/MODEL_ROUTING.md`). Filled by the Orchestrator from
harness usage stats after each stage.

| Stage | Model | Start (UTC) | End (UTC) | Wall | Tokens | Tool calls | Retry # |
|-------|-------|-------------|-----------|------|--------|------------|---------|
| Intake (paused for approval) | fable/opus (driving session) | 2026-06-15T17:20Z | 2026-07-13T06:04Z | interrupt held across sessions | n/a | n/a | 0 |
| Scope (EM) | sonnet | 2026-07-13T06:05Z | 2026-07-13T06:12Z | 6:36 | 74,191 | 17 | 0 |
| Architecture | opus | 2026-07-13T06:13Z | 2026-07-13T06:22Z | 8:11 | 83,434 | 25 | 0 |

## Next action

QA Evidence: read runs/email-digest/02-architecture.md and
runs/email-digest/03-impl-notes.md → independently re-run `npm run typecheck
&& npm test && npm run build && npm run qa:mvp` on
src/services/emailAdapter.js, src/services/digest.js, test/digest.test.js;
spot-check the audit-semantics differential (T-S2 vs T-S10), confirm no
item content / raw recipient ever lands in audit metadata, and confirm
user-scoping on the compose path (no cross-user item IDs); then produce QA
evidence and hand to Security & Privacy.

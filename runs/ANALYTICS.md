# Pipeline Analytics — generated

_Generated 2026-07-26T01:38:00Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/analyze.mjs .` from the repo root._

## Fleet

- Runs traced: **2** (+ 4 pre-telemetry)
- Stages: **13** · Tokens: **1,513,393** · Tool calls: **317**
- Clean density (ex cap-breach): **~3.6k tok/call** — the reproducible unit cost of one agentic step
- Envelope breaches: **1/2**

## Per run

| Run | Tier | Stages | Tokens | Calls | Density | Envelope | Status |
|-----|------|--------|--------|-------|---------|----------|--------|
| email-digest | 3 | 7 | 629,146 | 174 | 3.6k | 700,000 | ✅ pass |
| llm-summary | 2+overlay | 6 | 884,247 | 143 | 6.2k | 600,000 | ❌ over 284k |

## Per stage

| Run | Stage | Model | Tokens | Calls | Tok/call | Flags |
|-----|-------|-------|--------|-------|----------|-------|
| email-digest | Scope | sonnet | 74,191 | 17 | 4,364 | — |
| email-digest | Architecture | opus | 83,434 | 25 | 3,337 | — |
| email-digest | Implementation | sonnet | 92,740 | 30 | 3,091 | — |
| email-digest | QA | sonnet | 95,907 | 36 | 2,664 | — |
| email-digest | Security | opus | 70,034 | 17 | 4,120 | — |
| email-digest | Release | opus | 88,046 | 18 | 4,891 | — |
| email-digest | Post-Launch | sonnet | 124,794 | 31 | 4,026 | — |
| llm-summary | AI Engineer | sonnet | 117,247 | 46 | 2,549 | — |
| llm-summary | AI Governance | sonnet | 68,648 | 7 | 9,807 | ⚠ density |
| llm-summary | FinOps | sonnet | 396,543 | 10 | 39,654 | ⚠ over cap, ⚠ density |
| llm-summary | QA | sonnet | 126,396 | 42 | 3,009 | — |
| llm-summary | Security | opus | 81,234 | 18 | 4,513 | — |
| llm-summary | Release | opus | 94,179 | 20 | 4,709 | — |

## Outliers

- **AI Governance** (llm-summary): 68,648 tok / 7 calls — 2.7× the 3.6k density baseline
- **FinOps** (llm-summary): 396,543 tok / 10 calls — 2.6× the 150k per-stage cap; 11.0× the 3.6k density baseline

## Baselines

- Per-stage cap: **150,000** tokens · Slice envelope: **stages × 100,000** · Density baseline: **~3,600** tok/call

_Runs without `trace.json` (pre-telemetry / not instrumented): deploy, eval, http-api, run-1._

# Pipeline Analytics — generated

_Generated 2026-07-26T18:39:56Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/analyze.mjs .` from the repo root._

## Fleet

- Runs traced: **2** (+ 4 pre-telemetry)
- Stages: **13** · Tokens: **1,513,393** · Tool calls: **317**
- Envelope breaches: **1/2** · Stage outliers: **1**

## Per run

| Run | Tier | Stages | Tokens | Calls | Envelope | Status |
|-----|------|--------|--------|-------|----------|--------|
| email-digest | 3 | 7 | 629,146 | 174 | 700,000 | ✅ pass |
| llm-summary | 2+overlay | 6 | 884,247 | 143 | 600,000 | ❌ over 284k |

## Density by archetype

Tokens per tool call, measured against each archetype's own cap.

| Archetype | What it does | Cap | Observed (n) | Range | Avg |
|-----------|--------------|-----|--------------|-------|-----|
| **design** | reason → long artefact, few calls | 15,000 | 1 | 9,807–9,807 | 9,807 |
| **review** | read artefacts → verdict | 8,000 | 7 | 3,337–4,891 | 4,280 |
| **build** | heavy file / test I/O | 5,000 | 4 | 2,549–3,091 | 2,828 |

## Per stage

| Run | Stage | Type | Model | Tokens | Calls | Tok/call | % of cap | Flags |
|-----|-------|------|-------|--------|-------|----------|----------|-------|
| email-digest | Scope | review | sonnet | 74,191 | 17 | 4,364 | 55% | — |
| email-digest | Architecture | review | opus | 83,434 | 25 | 3,337 | 42% | — |
| email-digest | Implementation | build | sonnet | 92,740 | 30 | 3,091 | 62% | — |
| email-digest | QA | build | sonnet | 95,907 | 36 | 2,664 | 53% | — |
| email-digest | Security | review | opus | 70,034 | 17 | 4,120 | 52% | — |
| email-digest | Release | review | opus | 88,046 | 18 | 4,891 | 61% | — |
| email-digest | Post-Launch | review | sonnet | 124,794 | 31 | 4,026 | 50% | — |
| llm-summary | AI Engineer | build | sonnet | 117,247 | 46 | 2,549 | 51% | — |
| llm-summary | AI Governance | design | sonnet | 68,648 | 7 | 9,807 | 65% | — |
| llm-summary | FinOps | design | sonnet | 396,543 | 10 | 39,654 | 264% | ⚠ over cap, ⚠ density |
| llm-summary | QA | build | sonnet | 126,396 | 42 | 3,009 | 60% | — |
| llm-summary | Security | review | opus | 81,234 | 18 | 4,513 | 56% | — |
| llm-summary | Release | review | opus | 94,179 | 20 | 4,709 | 59% | — |

## Outliers

- **FinOps** (llm-summary, design): 396,543 tok / 10 calls — 2.6× the 150k per-stage token cap; 2.6× the 15k design-density cap

## Baselines

- Per-stage token cap: **150,000** · Slice envelope: **stages × 100,000**
- Density caps: **design** 15,000 · **review** 8,000 · **build** 5,000 (tok/call)

_Runs without `trace.json` (pre-telemetry / not instrumented): deploy, eval, http-api, run-1._

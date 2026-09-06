# Pipeline Analytics — generated

_Generated 2026-09-06T07:22:43Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/analyze.mjs .` from the repo root._

## Fleet

- Runs traced: **3** (+ 4 pre-telemetry)
- Stages: **22** · Tokens: **2,460,055** · Tool calls: **545**
- **Untraced stages: 1** across 1 run(s) — executed by the Orchestrator rather than spawned, so they carry no tokens or tool calls
- Envelope breaches: **2/3** · Stage outliers: **2**

## Per run

| Run | Tier | Stages | Tokens | Calls | Envelope | Status |
|-----|------|--------|--------|-------|----------|--------|
| email-digest | 3 | 7 | 629,146 | 174 | 700,000 | ✅ pass |
| llm-summary | 2+overlay | 6 | 884,247 | 143 | 600,000 | ❌ over 284k |
| saved-item-folders | 2 | 10 | 946,662 | 228 | 900,000 | ❌ over 47k |

## Pipeline completeness

Declared-vs-actual against the 12-stage lifecycle (`AGENTIC_SDLC.md`). An
**always** node missing is a real gap; a **conditional** node missing may be a
legitimate compression (`AGENTIC_SDLC.md` § "When to compress stages") — not
flagged either way, just listed, since only the EM's recorded rationale (not
this table) can say whether a given skip was earned.

| Run | Missing (always) | Skipped (conditional) | Unrecognized stage name |
|-----|-------------------|------------------------|--------------------------|
| email-digest | ⚠ Intake | Market Research, Discovery, UX Research, UI Design | — |
| llm-summary | ⚠ Intake, Scope Review | Market Research, Discovery, UX Research, UI Design, Architecture, Post-Launch | — |
| saved-item-folders | — | Market Research, Discovery, UX Research, UI Design | — |

## DORA

Per `PIPELINE_SLOS.md` § DORA mapping. **Only metrics the traces ground are reported** — anything without data says so.

| Metric | Value | Basis |
|--------|-------|-------|
| Lead time (median) | 5.2h | intake → landed, 3/3 slices dated |
| Deployment frequency | 0.4 slices/week | 3 landed over the traced span |
| Change failure rate | 0% | 0 post-landing fixes + 0 reverts ÷ 3 landed |
| Rework rate | 0.33 / slice | 1 stage retries + 0 post-landing fixes ÷ 3 landed |
| Failed-deployment recovery time | **8m** | median across 1 recorded gate-catch recovery window(s) |

> **Change failure and rework cover traced slices only.** 4 pre-telemetry run(s) are invisible here, so a defect shipped by one of them — and fixed later — is not counted. These rates are a floor, not a ceiling.

Per-slice lead time: email-digest 0.8h · saved-item-folders 5.2h · llm-summary 2.0d

## Density by archetype

Tokens per tool call, measured against each archetype's own cap.

| Archetype | What it does | Cap | Observed (n) | Range | Avg |
|-----------|--------------|-----|--------------|-------|-----|
| **design** | reason → long artefact, few calls | 15,000 | 1 | 9,807–9,807 | 9,807 |
| **review** | read artefacts → verdict | 8,000 | 12 | 3,337–5,671 | 4,352 |
| **build** | heavy file / test I/O | 5,000 | 7 | 2,549–3,407 | 3,005 |

## Per stage

| Run | Stage | Type | Model | Effort | Tokens | Calls | Tok/call | % of cap | Flags |
|-----|-------|------|-------|--------|--------|-------|----------|----------|-------|
| email-digest | Scope | review | sonnet | — | 74,191 | 17 | 4,364 | 55% | — |
| email-digest | Architecture | review | opus | — | 83,434 | 25 | 3,337 | 42% | — |
| email-digest | Implementation | build | sonnet | — | 92,740 | 30 | 3,091 | 62% | — |
| email-digest | QA | build | sonnet | — | 95,907 | 36 | 2,664 | 53% | — |
| email-digest | Security | review | opus | — | 70,034 | 17 | 4,120 | 52% | — |
| email-digest | Release | review | opus | — | 88,046 | 18 | 4,891 | 61% | — |
| email-digest | Post-Launch | review | sonnet | — | 124,794 | 31 | 4,026 | 50% | — |
| llm-summary | AI Engineer | build | sonnet | — | 117,247 | 46 | 2,549 | 51% | — |
| llm-summary | AI Governance | design | sonnet | — | 68,648 | 7 | 9,807 | 65% | — |
| llm-summary | FinOps | design | sonnet | — | 396,543 | 10 | 39,654 | 264% | ⚠ over cap, ⚠ density |
| llm-summary | QA | build | sonnet | — | 126,396 | 42 | 3,009 | 60% | — |
| llm-summary | Security | review | opus | — | 81,234 | 18 | 4,513 | 56% | — |
| llm-summary | Release | review | opus | — | 94,179 | 20 | 4,709 | 59% | — |
| saved-item-folders | Scope Review | review | opus | medium | 82,518 | 20 | 4,126 | 52% | — |
| saved-item-folders | Architecture | review | opus | high | 96,407 | 17 | 5,671 | 71% | — |
| saved-item-folders | Implementation | build | sonnet | medium | 108,611 | 33 | 3,291 | 66% | — |
| saved-item-folders | QA Evidence | build | sonnet | high | 105,620 | 31 | 3,407 | 68% | — |
| saved-item-folders | Security Review | review | opus | high | 111,157 | 32 | 3,474 | 43% | — |
| saved-item-folders | Implementation rework | build | sonnet | medium | 93,651 | 31 | 3,021 | 60% | — |
| saved-item-folders | Security re-verify | review | opus | high | 79,104 | 21 | 3,767 | 47% | — |
| saved-item-folders | Release Gate | review | sonnet | high | 140,994 | 27 | 5,222 | 65% | — |
| saved-item-folders | Post-Launch | review | sonnet | medium | 128,600 | 16 | 8,038 | 100% | ⚠ density |

## Untraced stages

Executed by the Orchestrator rather than spawned as a subagent, so they
carry no tokens or tool calls. **Every fleet and per-run figure above
excludes them** — treat slice costs as a floor, not a total.

| Run | Stage | Recorded via |
|-----|-------|-------------|
| saved-item-folders | Intake | `executor` (trace@2) |

## Gate catches

Defects the gates caught before they shipped — the pipeline earning its keep.
**A floor, not a total:** 2 run(s) predate the `gateCatches` field (email-digest, llm-summary) and recorded catches only in prose, so a real block — e.g. Security stopping the http-layer bind — is not counted here.

**Structured catches: 1**

| Run | Gate | Verdict | Severity | Finding | Recovery |
|-----|------|---------|----------|--------|----------|
| saved-item-folders | Security | fail | required-fix | SEC-1: clearFolderFromItems's userId-ownership clause had zero test coverage (proven by live mutation: removing it left the 76-test suite green while nulling another user's folderId). SEC-2: the 'invariant 4 — no content in audit' test only checked deep-equal shape, so a leaked folder name would have passed it (proven by live mutation of the audit call). Both were suite gaps, not shipped defects — verified correct at all enforcement points before and after the fix. | 8m |


## Outliers

- **FinOps** (llm-summary, design): 396,543 tok / 10 calls — 2.6× the 150k per-stage token cap; 2.6× the 15k design-density cap
- **Post-Launch** (saved-item-folders, review): 128,600 tok / 16 calls — 1.0× the 8.0k review-density cap

## Baselines

- Per-stage token cap: **150,000** · Slice envelope: **stages × 100,000**
- Density caps: **design** 15,000 · **review** 8,000 · **build** 5,000 (tok/call)

_Runs without `trace.json` (pre-telemetry / not instrumented): deploy, eval, http-api, run-1._

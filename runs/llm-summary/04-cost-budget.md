# Cost & Budget Review — llm-summary

> Owner: FinOps Agent
> Status: pass (current shipped state) — see Recommendation for the forward gate on the future LLM slice
> Source tech spec: no dedicated Architect-stage spec exists for this slice (`runs/llm-summary/02-impl-notes.md` notes the AI Engineer owned the deterministic-vs-LLM split directly). This review's inputs: `runs/llm-summary/02-impl-notes.md` and `src/services/summary.js` (commit `9c96bdd`, branch `slice/llm-summary`).

## Context

Two adapters exist behind one `SummarizerAdapter` interface (`summarizeItems(userId, adapter?)` in `src/services/summary.js`):

- **`DeterministicSummarizer`** (default, live today): composes a summary from the real `items` array only — count + a verbatim snippet. No model, no network, no randomness.
- **`PlaceholderLlmSummarizer`** (live today, inert): `summarize()` throws unconditionally, every call, with no config/env/argument to suppress it. Per `summary.js`'s own header comment and `APPROVAL_RECORD-1.md` (referenced there), no real model, network access, or keys are approved for this slice — a real model is a separate, future rule-5 approval.

**Today's live cost-risk is therefore zero** — there is no code path that can spend a token. This review models the cost shape of the *future* real LLM adapter now, so the kill-switch design exists and is on record before anyone wires a model in, per this agent's operating constraint ("An unbounded-cost path does not ship without a tested circuit-breaker").

## Cost drivers

| Driver | Unit | Unit price | Notes |
|--------|------|------------|-------|
| Deterministic summarizer (`DeterministicSummarizer`) | — | **$0.00** | Live today. Pure in-memory string ops over `listItems()`'s output — no model, no network, no I/O. Confirmed by code read: impl notes cite no `console.*`/`process.env` reads and no network-capable API anywhere in `summary.js`. Cost is folded into general app-hosting compute; it is not a distinct billable driver introduced by this slice. |
| Future LLM input tokens — **primary assumption: Claude Haiku 4.5** | per 1M tokens | $1.00 | Not yet wired (`PlaceholderLlmSummarizer` always throws). Haiku is the representative assumption because this is a lightweight, single-call, short-output summarization task — the natural fit for Anthropic's fastest/cheapest current-gen model, not a multi-step agentic task. **Model choice is an AI Engineering decision, not FinOps's** — this is a cost-shape assumption only. |
| Future LLM output tokens — Claude Haiku 4.5 | per 1M tokens | $5.00 | ” |
| Future LLM input tokens — **sensitivity: Claude Sonnet 5** | per 1M tokens | $3.00 | Higher-capability alternative, shown as an upper-bound case in case the real slice needs more than Haiku-tier quality. Standard list price used (a $2.00 introductory rate is active only through 2026-08-31, before this deferred slice is expected to ship). |
| Future LLM output tokens — sensitivity: Claude Sonnet 5 | per 1M tokens | $15.00 | ” (intro $10.00 through 2026-08-31) |

### Assumptions (stated explicitly — no real prompt text exists yet to measure)

- **Average item content:** ~200 characters ≈ **50 tokens**, using the standard ~4-chars/token English-text heuristic. There is no size cap on `content` in `savedItems.js` (free text, unbounded), so this is an estimate, not a schema-derived fact. Recalibrate with `messages.count_tokens` against real prompts once the adapter exists — do not carry this heuristic into production budgeting unchanged.
- **Fixed prompt/system overhead:** ~200 tokens (system instructions + response-shape guidance), assumed.
- **Output length:** 80–200 tokens depending on item count, since the product intent (per the deterministic summarizer's own shape) is a *short* summary, not a per-item report.
- **Representative item count: 20** (a plausible "typical active user" saved-items list). **This is not sourced from a PRD or usage data** — none was in scope for this review (see Findings). Sensitivity shown at 5 / 20 / 100 / 5,000 items below so real volume can be substituted later.

## Cost-per-action

- **Action:** a user requests a summary of their saved items (`summarizeItems(userId, adapter)`).
- **Deterministic path (live today):** **$0.00** — the free, always-available fallback.
- **Future LLM path (not yet wired) — arithmetic:**

  `cost = (input_tokens / 1,000,000 × input_price) + (output_tokens / 1,000,000 × output_price)`
  `input_tokens ≈ 200 (fixed overhead) + item_count × 50 (assumed tokens/item)`

| Item count | Input tokens | Output tokens | Cost — Haiku 4.5 ($1/$5) | Cost — Sonnet 5 ($3/$15) |
|---|---|---|---|---|
| 5 (light user) | 450 | 80 | $0.00085 | $0.00255 |
| **20 (representative)** | **1,200** | **100** | **$0.0017** | **$0.0051** |
| 100 (power user) | 5,200 | 150 | $0.00595 | $0.01785 |
| 5,000 (outlier — e.g. a heavy bookmarker) | 250,200 | 200 (assumed output cap) | ~$0.251 | ~$0.754 |

**Cost per action, future LLM path (headline number): ≈ $0.0017 (Haiku, representative) to $0.0051 (Sonnet, representative) per summary.** Even the 5,000-item outlier tops out around $0.25–$0.75 for a *single* call — per-call price is cheap at any realistic list size. The real cost risk is call **frequency**, not per-call size (see Findings and Kill-switch below).

## Projected volume & monthly cost

- **Projected volume: no sourced estimate.** This review's scope was limited to the agent definition, the cost template, the shipped code, and the implementation notes — none of which carry a PRD or Data Analyst volume projection, and `savedItems.js` is explicitly in-memory/seed-stage (no real production traffic exists yet). The table below is an **illustrative sensitivity range**, not a forecast — substitute real numbers once available (flagged as a finding).

| Volume / month | Monthly cost — Haiku 4.5 | Monthly cost — Sonnet 5 |
|---|---|---|
| 1,000 | $1.70 | $5.10 |
| 10,000 | $17.00 | $51.00 |
| 100,000 | $170.00 | $510.00 |
| 1,000,000 | $1,700.00 | $5,100.00 |

- **At 10x volume** (e.g. 100K → 1M/mo, or 1M → 10M/mo): cost scales **linearly** — nothing balloons in dollar terms, because each summary is an independent, bounded call (no chained/agentic loop, no unbounded output). At 10M/mo the range is still only ~$17,000–$51,000/mo. What *does* need to scale is the kill-switch's own rate-limit and spend-cap configuration (below) — if those constants aren't reviewed as legitimate volume grows, the circuit breaker itself becomes the growth bottleneck, silently degrading real users to the deterministic path even though nothing is actually wrong.

## Unit economics

- **Value / price per action:** No separate end-user price exists for this action — it's a bundled product feature (saved-items UX), not a metered SKU. "Margin per action" in the traditional sense doesn't apply.
- **Margin per action:** N/A (no direct price to net against) — reframe as **cost load absorbed into existing infra/COGS budget**. At $0.0017–$0.0051/summary, that load is trivial for any subscription- or ad-supported product, *provided* call frequency per user is bounded (see below).
- **Sustainable?** **Yes, on per-call price alone — cheap even at the 5,000-item outlier ($0.25–$0.75/call).** The one condition that determines real sustainability is **call frequency**, not price: nothing today bounds how often a user (or a buggy/abusive client) could invoke this endpoint once a real model exists, and repeated/looped calls are what turn a sub-cent action into a real bill. This is the primary justification for the kill-switch design below, and it should weight the rate-limit and spend-cap dimensions more heavily than the per-request token cap.

## Budget & alerts

Applies once the future LLM path is live — **$0 today**, since `PlaceholderLlmSummarizer` cannot spend.

- **Budget ceiling (placeholder, pending real volume):** $50/month for an initial rollout. At Haiku pricing that's ~29,400 summaries/month (~1,000/day); at Sonnet pricing, ~9,800/month (~325/day). Recalibrate once the PM/Data Analyst supplies real projected volume.
- **Alert thresholds:** 50% ($25) and 80% ($40) — alert before the ceiling, not at it.
- **Alert routing:** the same on-call/alerting surface already used for this repo's other alerts — coordinate with the SRE agent rather than standing up a second surface (per this agent's operating constraint).

## Kill-switch / circuit-breaker

Required before the LLM path is ever unthrottled. Design only — nothing to implement yet, since `PlaceholderLlmSummarizer` throws before any of this logic would run.

**Trigger** (three layers, in order of how much they should matter — see Unit economics above on why frequency dominates):

1. **Per-request cap (defense-in-depth):** estimated input tokens for a single call exceed a configured ceiling (e.g. >50K tokens, or item_count > 1,000) → *that request's* LLM call is skipped.
2. **Rate limit (primary defense):** per-user LLM-mode calls exceed N/hour (e.g. 10/hour), or a global concurrency/QPS ceiling is exceeded → the affected request(s) skip the LLM call.
3. **Spend/token cap (primary defense, fleet-wide):** rolling-window (daily or monthly) cumulative tracked spend/tokens for the LLM path crosses the configured ceiling (see Budget above) → LLM mode is disabled **fleet-wide** until the window resets or an operator manually re-enables.

**Behaviour when tripped (all three layers):** the orchestration around the future real adapter falls back to `new DeterministicSummarizer()` for the affected call(s) — same pattern `summarizeItems` already uses as its default parameter today. The end user always gets a valid response; no cost-related trip is ever surfaced as a user-facing failure. The audit event (`recordAuditEvent(..., "items.summarized", ...)`) still fires with `generationMode: "deterministic"`; recommend the future implementation extend the audit metadata with a non-content fallback-reason field (e.g. `"cost_circuit_open"`) so ops telemetry can distinguish "deterministic by request" from "downgraded by circuit breaker" — this reuses the existing `audit.js` pattern rather than inventing a new one.

**Tested?** **No — cannot be, yet.** The mechanism doesn't exist in code (correctly: the LLM path is presently a throwing placeholder, so today's live risk is zero). This is expected for the current slice, **not a gap in commit `9c96bdd`**. It becomes a hard blocking requirement the moment a real model is wired: the future implementation must ship with tests simulating all three triggers and asserting (a) no exception ever propagates to the caller, (b) the returned shape matches `DeterministicSummarizer`'s contract, (c) `itemCount` still equals the true live-item count under fallback (this repo's own no-invention invariant, already tested in `test/summary.test.js`), and (d) the audit event fires with the correct `generationMode`. Recommend these land as new EVAL-style cases in `test/summary.test.js`, following the convention impl notes already describe ("20 tests: happy paths (6), the 6 required safety-invariant EVAL cases, a guard case").

## Findings

| Finding | Severity |
|---------|----------|
| No sourced product volume/PRD projection was available to this review (scope limited to agent def, template, shipped code, and impl notes). Monthly-cost figures above are illustrative sensitivity tiers, not a forecast. | advisory |
| `stash-seed`'s data layer is in-memory/ephemeral (prototype stage, per `savedItems.js`'s own header comment) — reinforces that current real volume is zero; this review is pre-emptive modeling, not a live budget. | advisory |
| The kill-switch described above does not exist in code yet. Correct for today (zero live risk), but it is a **blocking requirement on the future rule-5 slice**: no real LLM adapter may ship without an implemented **and tested** token/rate/spend circuit breaker that falls back to `DeterministicSummarizer`. Not a gap in this slice's shipped commit. | blocker (scoped to the future slice, not this one) |
| Per-call price stays cheap even for large inputs (a 5,000-item outlier user ≈ $0.25–$0.75 for one call). The dominant cost risk is call **frequency** (retry storms, buggy polling clients, abuse), not per-token price — weight rate-limit + spend-cap design accordingly over the per-request token cap. | advisory |
| No separate end-user price exists for this action (bundled feature, not a metered SKU) — "margin per action" isn't meaningful here; sustainability is framed as trivial cost load on existing infra budget instead. | advisory |

## Recommendation

- [x] **Pass** to Release Manager — for the slice as shipped (commit `9c96bdd`): deterministic path is free and live, LLM path is an inert throwing placeholder, so live cost-risk today is $0.
- [ ] Required fix — **conditionally required on the future rule-5 slice, not this one:** the LLM path may not ship with a real model until the kill-switch above is implemented and tested per the "Tested?" section. Treat this as a gating condition on that future approval, separate from today's pass.

## Hand off

To the Release Manager (this review is a release input for the current slice) and the Orchestrator (to carry the kill-switch requirement forward as a gating condition on the future rule-5 / real-model slice). Kill-switch operation hands to the SRE in production once implemented.

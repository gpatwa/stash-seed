# Slice Plan — llm-summary (Phase 3)

> Stage 1 · Owner: Orchestrator
> Status: paused — awaiting human approval (rule 5) before implementation

## User-facing outcome

A user can see an AI-generated summary — a short natural-language overview —
of their saved items.

## Proposed stages

AI feature on the existing b2c product. The AI overlay roles engage:
Scope (EM) → **AI Engineer** (deterministic-first + evals) → **AI Governance**
(risk tier) → **FinOps** (cost + kill-switch) → QA → Security → Release.
No UI (headless seed).

## ⚠ Gated action detected (Intake scan)

Delivering a genuine *LLM* summary means wiring a real model. That trips:

- **Rule 5 — inviting an LLM into a previously-deterministic path**
  (`docs/HUMAN_APPROVAL_RULES.md`). Rule 5 requires the human to approve the
  LLM approach **before implementation begins**.
- **Invariant 7** (`.agentic/SAFETY_INVARIANTS.md`): LLM adapters throw by
  default; no live model call enters the build without approval.

Per `APPROVAL_PROTOCOL.md`, the run is **paused at intake**. See
`APPROVAL_REQUEST-1.md`.

## Intended design (pending the decision)

Deterministic-first, per `agents/ai-engineer.md`:

- A `SummarizerAdapter` interface with a `PlaceholderLlmSummarizer` that
  **throws by default** ("LLM summarizer is not configured in this build").
- A **deterministic summary** that always works with no model: counts by
  inferred type + recency (e.g. "12 saved items — 8 links, 4 notes; most
  recent added today"). Reuses `listItems` (user-scoped).
- **Eval cases** on the safety invariants: the summary never invents items,
  counts, or content the user doesn't have; it is user-scoped; item content
  never appears in logs.
- **AI Governance** assigns a risk tier (`AI_RISK_ASSESSMENT_TEMPLATE.md`).
- **FinOps** models token cost-per-summary and a kill-switch for the LLM
  path (`COST_BUDGET_TEMPLATE.md`) — even though no real model is wired yet.

## Success criteria

- The deterministic summary is correct and **never invents** items/counts.
- The placeholder throws — no real model, no network, no keys in the build.
- Evals cover the no-invention invariant; summary is user-scoped.

## Non-goals

- Wiring a real model / provider (a **separate** rule-5 approval when a
  provider + keys are chosen). Streaming. Persistence changes.

## Release tier

**Tier 2** for the deterministic-first build (no external effect; the
placeholder throws). Wiring a real model later would be Tier 3 + rule 5.

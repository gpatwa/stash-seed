# EM Scope & Design Brief — llm-summary

> Stage 3 · Owner: Engineering Manager (orchestrator-driven)
> Hand off to: AI Engineer

## Scope decision

Accepted as a **single Tier-2 slice**. Small feature over existing services.

## Compression (recorded)

- **No separate Architect stage.** The AI Engineer owns the
  deterministic-vs-LLM split and the adapter/placeholder shape (per
  `agents/ai-engineer.md`), so the design lives in the implementation stage.
- AI Governance and FinOps run **after** implementation (they assess the
  built capability). QA + Security + Release run in full for Tier 2.

## The scoped work item (for the AI Engineer)

Build a `summarizeItems(userId, adapter?)` capability, **deterministic-first**:

- **Deterministic default** (always works, no model): summarise the user's
  live items using only real data — the true item count, and a snippet of
  the most recent item's actual content. It must never state a count or a
  detail that isn't true of the user's items.
- **Adapter seam**: a `SummarizerAdapter` interface; a
  `DeterministicSummarizer` (the default) and a `PlaceholderLlmSummarizer`
  that **throws** by default ("...not configured in this build"). Reuse
  `listItems` (user-scoped) and `recordAuditEvent`.
- **Audit with source mode**: emit an `items.summarized` audit event with
  `{ itemCount, generationMode }` (`"deterministic" | "llm"`) — IDs/counts
  only, never content.
- **Evals** (safety invariants): the summary's claimed count === the user's
  real item count; any snippet is a substring of a real item; user-scoped
  (u2's items never appear in u1's summary); the placeholder LLM adapter
  throws; no item content in logs.

## Constraints carried in

- Approval scope (`APPROVAL_RECORD-1.md`): **no real model, no network, no
  keys**. The LLM path is the throwing placeholder only.
- Invariants 4 (no content in logs), 5 (user-scoped), 7 (LLM adapters throw
  by default). AI Engineer anti-pattern: **never invent user-facing claims**.
- Reuse existing services; do not modify them.

## Gate map (Tier 2)

Implementation gates + QA + Security + Release checklist. No human-approval
gate beyond the rule-5 record already obtained (no external effect; the
placeholder throws). Deferred: real-model wiring (separate rule 5, Tier 3).

## Success criteria

Deterministic summary correct and never-inventing; placeholder throws; evals
green; user-scoped; audit carries `generationMode`.

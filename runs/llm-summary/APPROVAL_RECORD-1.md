# Approval Record 1 — llm-summary

> Companion to `APPROVAL_REQUEST-1.md`, per `.claude/protocols/APPROVAL_PROTOCOL.md`.

- **Decision:** APPROVED
- **Approver:** the human operator (gpatwa), via the driving session's
  approval prompt
- **When:** 2026-07-24T00:10Z (UTC)
- **Scope approved:** build the summary **deterministic-first** — a working
  no-model summary behind a `SummarizerAdapter` seam whose LLM placeholder
  **throws by default** — plus eval cases, the AI-risk assessment, and the
  cost model. Rule 5 (inviting an LLM into the deterministic path) approved
  for building the placeholder seam only.
- **Explicitly NOT approved (deferred):** wiring a real model / provider or
  enabling live inference — a separate rule-5 approval when a provider +
  keys are chosen.
- **Human response (verbatim):** "Approve"

The Release Manager must verify this record, and confirm the shipped diff
contains no real model / network / keys, before the slice lands.

# Approval Request 1 — llm-summary

> Per `.claude/protocols/APPROVAL_PROTOCOL.md` and the playbook's
> `docs/HUMAN_APPROVAL_RULES.md` rule 5. The run is paused until answered.

## What I want to do

Build the AI-summary feature **deterministic-first**: a deterministic
summary of the user's items that always works with no model, behind a
`SummarizerAdapter` seam whose `PlaceholderLlmSummarizer` **throws by
default**. Add eval cases on the safety invariants (no invented items /
counts / content; user-scoped). **No real model, no network, no keys** enter
the build in this slice.

## Why approval is needed

- **Rule 5 (inviting an LLM into a previously-deterministic path).** The ask
  is for an *LLM* summary, so the slice plan must call out the LLM approach
  and the human must approve it before implementation begins — even though
  this slice only builds the throwing placeholder, not a live model.
- **Invariant 7**: LLM adapters throw by default; no live model call without
  approval.

## What is reversible if you say no

Everything — nothing is built yet. And even if you approve: the placeholder
throws, so no inference can actually run until a real model is wired, which
is a **separate** rule-5 approval when a provider + keys are chosen.

## The smallest request

Approve **only** building the deterministic-first summary + the throwing
placeholder + evals + the AI-risk and cost artefacts. Wiring a real model /
provider and enabling live inference is explicitly **not** part of this
request.

## Your options

- **Approve** → I record it and proceed: EM scope → AI Engineer
  (deterministic-first + placeholder + evals) → AI Governance (risk tier) →
  FinOps (cost + kill-switch) → QA → Security → Release.
- **Approve + wire a real model now** → not possible in this dependency-free
  build (no provider/keys); would also change the cost shape (FinOps) and be
  Tier 3. Recommend deferring.
- **Deny** → I stop the slice and report.

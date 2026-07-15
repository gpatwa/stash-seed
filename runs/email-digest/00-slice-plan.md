# Slice Plan — email-digest

> Stage 1 · Owner: Orchestrator
> Status: paused — awaiting human approval before Scope/implementation

## User-facing outcome

A user can receive an email digest listing their saved items.

## Proposed stages

Small, well-understood feature on an existing service. Proposed:
Scope (EM) → Architecture → Implementation → QA → Security → Release →
Post-Launch. Market Research skipped (well-understood). Headless seed, so no
UI stage.

## ⚠ Gated actions detected (Intake scan)

This slice trips `docs/HUMAN_APPROVAL_RULES.md`:

- **Rule 1 — sending on behalf of a user.** The feature sends an email on
  the user's behalf. Introducing this capability is a Tier-3 change and
  requires human approval.
- **Rule 6 — new third-party data processor** (deferred). Actually
  delivering email needs an email provider that would receive the user's
  address + item titles. That is a *separate* approval, requested only when
  a real provider is wired.

Per `APPROVAL_PROTOCOL.md`, the run is **paused at intake** for approval
before any implementation begins. See `APPROVAL_REQUEST-1.md`.

## Intended design (pending approval)

- `EmailAdapter` interface with a `PlaceholderEmailAdapter` that **throws by
  default** ("Email sending is not configured in this build") — deterministic
  -first, no real send in the build, tests run without a provider.
- `sendItemsDigest(userId)` — composes the digest deterministically from the
  user's items, calls the adapter, emits an audit event. User-scoped.
- No item content in logs (IDs/counts + recipient hash only).

## Success criteria

- Digest composed correctly for a user's items (unit-tested).
- The placeholder adapter throws by default — no silent send.
- The action is audited; user-scoped.

## Non-goals

- Scheduling / cron, unsubscribe management, HTML template polish.
- Wiring a real email provider (separate slice + separate approval).

## Release tier

**Tier 3** (introduces a send-on-behalf capability).

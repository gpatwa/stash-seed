# Approval Request 1 — email-digest

> Per `.claude/protocols/APPROVAL_PROTOCOL.md` and the playbook's
> `docs/HUMAN_APPROVAL_RULES.md`. The run is paused until answered.

## What I want to do

Proceed to **build** an email-digest feature: a `sendItemsDigest(userId)`
service that composes a digest of the user's saved items and sends it on the
user's behalf — implemented against a **placeholder email adapter that
throws by default**. No real emails are sent and no real email provider is
wired in this slice.

## Why approval is needed

- **Rule 1 (sending on behalf of a user).** This introduces a
  send-on-behalf code path. Even with the adapter throwing, standing up the
  capability is a Tier-3 change that the rules require a human to authorize.

## What is reversible if you say no

Everything. Nothing has been built yet — denying costs only this intake
planning. (Even if approved: the adapter throws by default, so no email can
actually be sent until a real provider is wired, which is a **separate**
approval under rule 6. The whole feature can also be removed with a single
revert.)

## The smallest request

Approve **only** building the deterministic digest + the throwing
placeholder adapter, with tests. Wiring a real email provider and enabling
real sends is explicitly **not** part of this request — it would come back
to you as a separate approval.

## Your options

- **Approve** → I record this and proceed to scope + build (placeholder
  adapter, no real send).
- **Deny** → I stop the slice and report back.
- **Modify** → tell me the constraint (e.g. "fine, but also no item titles
  in the digest payload") and I'll fold it in.

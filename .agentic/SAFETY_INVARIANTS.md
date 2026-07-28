# Safety Invariants — Stash (seed)

These MUST hold across releases. A slice may not weaken them without
explicit human approval.

1. **Deletes are soft and recoverable.** Deleting sets `deletedAt`; the
   record is retained, not removed.
2. **Destructive multi-item actions are confirmed.** Any action removing
   more than one item in one gesture requires a confirmation that states
   the count. (In this headless seed, "confirmation" = the bulk API
   requires an explicit list of IDs; it never deletes by a broad filter.)
3. **Every delete is audited.** Each deletion (single or bulk) emits an
   append-only audit event.
4. **No item content in logs.** Logs/audit metadata may carry item IDs and
   counts — never the saved content.
5. **A user only ever affects their own items.** Every operation is scoped
   by `userId`; another user's IDs are rejected, never deleted.
6. **AI / LLM adapters throw by default.** Any AI capability ships with a
   placeholder adapter that throws; no live model call enters the build
   without approval (wiring a real model is `HUMAN_APPROVAL_RULES` rule 5).
   AI-generated user-facing text is deterministic-first and never invents
   items, counts, or content the user doesn't have.
7. **The server is reachable only from the host it runs on.** The listener
   binds `LISTEN_HOST = "127.0.0.1"` explicitly — never `0.0.0.0`, and never
   a bare `listen(port)`, whose default is every interface. This is not a
   deployment preference: there is **no authentication**, `userId` is a
   self-asserted header, so invariant 5 holds only because nobody else can
   reach the socket. Unreachability *is* the access control. Widening the
   bind — or exposing the port by any other route — is a safety-control
   change under `HUMAN_APPROVAL_RULES` rule 4, and requires human approval
   **and** real authentication landing in the same slice, never as a
   follow-up. Recorded because the sibling reference app shipped exactly this
   defect — `streak-seed`'s `http-layer` review raised a wildcard bind as a
   release blocker (BIND-1) after reaching a user's data over the LAN. This
   server was audited and corrected off the back of that finding, **not** by
   a gate of its own: no stash-seed run caught it, which is precisely why the
   control belongs here rather than only in a code comment.

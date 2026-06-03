# Project Context — Stash (seed)

## What Stash is

A B2C SaaS for saving and organising items into lists ("a tidier bookmarks
app"). Individuals are the buyers; no team / admin concept yet.

## Current focus

List hygiene — helping users keep saved items manageable. Single-item
delete exists; users want to clear out many at once.

## Applicable project pack

`project-packs/b2c-saas.md` in the playbook — individual buyer,
low-friction, accomplish the task fast.

## Tech shape

- Dependency-free Node (ESM). No build tooling, no external packages.
- `src/services/savedItems.js` — `addItem`, `listItems`, `softDeleteItem`.
- `src/services/audit.js` — `recordAuditEvent`, `listAuditEvents`.
- Tests use the built-in `node:test` runner under `test/`.

## Out of scope right now

- Teams, sharing, RBAC. Anything that sends/posts on the user's behalf.

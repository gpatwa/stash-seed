# Slice — HTTP API surface (Phase 2b)

> Tier 2 (new surface, no external effect). Compressed slice.

## EM compression decision (recorded)

Built directly by the orchestrator/engineer rather than through the full
7-agent pipeline. Rationale: this is a thin, well-understood wrapper over
services that already have independent tests and two prior pipeline runs;
the pipeline itself is validated (runs 1–2), so re-spawning 7 agents (~600k
tokens) would re-prove nothing and blow the token SLO the last run flagged.
Full gate discipline is kept — the change lands via PR and CI runs every
gate. A full pipeline run is reserved for slices that validate *new*
machinery (e.g. Phase 3's rule-5 LLM interrupt).

## What shipped

A dependency-free `node:http` server (`src/server.js`) exposing:

| Method + path | Does | Reuses |
|---------------|------|--------|
| `GET /health` | liveness | — |
| `GET /items?userId=` | list a user's live items | `listItems` |
| `POST /items` | add an item | `addItem` |
| `POST /items/bulk-delete` | soft-delete an explicit ID list | `bulkDeleteItems` |
| `POST /digest` | attempt a digest send → **503** (placeholder throws) | `sendItemsDigest` |

`npm start` runs it (`PORT`, default 3000). Tests in `test/server.test.js`
start ephemeral instances and exercise every route. `scripts/build-check.mjs`
now imports all modules including the server; `typecheck` covers all of `src`.

## Safety posture over HTTP

- **User-scoping preserved** — reads/writes carry `userId`; a user never
  sees another's items (tested).
- **No item content in logs** (invariant 4) — the access log is bodiless
  (method, path, status, ms); the query string (may carry `userId`) is
  excluded.
- **No leaked internals** — errors return generic JSON (`bad request` /
  `not found` / `email sending is not configured`); no stack traces, no
  adapter names, no item content (tested).
- **Input validation** — missing `userId`/`content`/`recipient` → 400;
  non-array `itemIds` → 400 (via the service's `TypeError`); invalid JSON →
  400; body capped at 1 MB.
- **Digest still cannot send** — the placeholder adapter throws → 503; the
  attempt is still audited. Wiring a real provider remains a deferred rule-6
  slice.

## Known limitation (flagged, not fixed)

**No authentication.** `userId` is a request parameter — the same contract
the services already use. This is fine for a local/CI target but a real
deployment MUST add authn/authz before exposure. Filed as the top follow-up
for a future slice; the digest 503 and soft-delete keep the surface safe to
run locally in the meantime.

## Gates

Local `npm run typecheck && npm test && npm run build && npm run qa:mvp` +
CI (`.github/workflows/ci.yml`) on the PR. Rollback: revert the slice commit
(no migration, no state).

## Non-goals

Auth/TLS, real deploy + smoke + rollback drill (Phase 2c), a real email
provider (deferred rule-6).

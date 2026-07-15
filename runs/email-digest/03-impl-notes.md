# Implementation Notes — email-digest

> Stage 4 · Owner: Backend Architect
> Status: implemented, verified green
> Source: `runs/email-digest/02-architecture.md`

## Files created (3 new, 0 modified)

| File | Purpose |
|------|---------|
| `src/services/emailAdapter.js` | `EmailMessage`/`EmailAdapter` typedefs + `PlaceholderEmailAdapter` (always throws) |
| `src/services/digest.js` | `composeDigest` (pure) + `recipientHash` + `sendItemsDigest` orchestration |
| `test/digest.test.js` | 15 tests: T-C1–3 (composer), T-A1–2 (adapter), T-S1–10 (orchestration) |

Confirmed zero modifications to existing files: `git diff --stat -- src/ test/ package.json` returned empty before commit.

## Verify commands (run from repo root)

### `npm run typecheck`
```
> stash-seed@0.1.0 typecheck
> for f in src/services/*.js; do node --check "$f" || exit 1; done; echo "typecheck ok"

typecheck ok
```

### `npm test`
```
✔ sendItemsDigest: injected resolving stub — resolves, exactly one digest_sent, clean metadata, no content leak
✔ bulkDeleteItems: single-item list behaves like softDeleteItem (0.0687ms)
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
27/27 passing. **Test count: 12 before (savedItems.test.js only) → 27 after** (+15 from digest.test.js). `savedItems.test.js` unmodified and its 12 cases all still pass (T-R1).

### `npm run build`
```
> stash-seed@0.1.0 build
> node -e "Promise.all([import('./src/services/savedItems.js'),import('./src/services/audit.js')]).then(()=>console.log('build ok')).catch(e=>{console.error(e);process.exit(1)})"

build ok
```
Note: the build script's import list (`savedItems.js`, `audit.js`) is unchanged by design (0 existing files modified), so it doesn't directly import `digest.js`/`emailAdapter.js`. Both new modules are exercised at runtime via `npm test` (which imports them through `digest.test.js`) and syntax-checked via `typecheck`'s glob over `src/services/*.js`, which does pick up both new files.

### `npm run qa:mvp`
```
typecheck ok
...
ℹ tests 27
ℹ pass 27
ℹ fail 0
```
Green — no retries needed, failure budget untouched (0/2).

## Spec deviations

None. Implementation follows `02-architecture.md` exactly: file plan (3 new, 0 modified), exported signatures, control-flow ordering in `sendItemsDigest` (guard userId → guard recipient → `listItems` → `composeDigest` → `recipientHash` → attempt-audit **before** `adapter.send` → sent-audit only after a real resolve → return), audit metadata shape (`itemIds`/`itemCount`/`recipientHash` only, both event types), and the SHA-256/12-hex-char `recipientHash`.

Two spots where the spec left prose explicitly non-load-bearing and I made a concrete choice:
- Zero-state `body` text: used the spec's own example verbatim, `"You have no saved items right now."`.
- Non-empty `body` header line: spec specified "a fixed header followed by one `- ${content}` line" without fixing the header's wording; used `"Here are your saved items:"`. Confirmed via T-C1 that tests assert structure (count, ID presence, content presence, subject contains count) — not exact body text — so this choice doesn't constrain future wording changes.

## Boundary-integrity spot-check (for Security & Privacy)

`grep -rn "Adapter" src/` output:
```
src/services/emailAdapter.js:8: * @typedef {Object} EmailAdapter
src/services/emailAdapter.js:19:export class PlaceholderEmailAdapter {
src/services/emailAdapter.js:25:      "Email sending is not configured in this build (PlaceholderEmailAdapter).",
src/services/digest.js:7:import { PlaceholderEmailAdapter } from "./emailAdapter.js";
src/services/digest.js:66: * @param {EmailAdapter} [adapter]  Defaults to a new PlaceholderEmailAdapter
src/services/digest.js:77:  adapter = new PlaceholderEmailAdapter(),
src/services/digest.js:105:  // Unreachable with PlaceholderEmailAdapter — only a real (or test-stub)
```
Only `PlaceholderEmailAdapter` is ever constructed under `src/`; the only other match is the `EmailAdapter` interface typedef (a JSDoc type name, not a class). The sole resolving (non-throwing) adapter anywhere in the repo is a local `{ name, async send() {} }` object literal defined inline in `test/digest.test.js` (used by T-S10, and by the spy in T-S8/T-S9 to prove "no adapter call" on the guard paths) — no I/O, test-file-only, never imported by anything under `src/`.

Also confirmed: no `console.*` calls added, no `process.env` reads, no new dependency (`package.json` diff empty), no network call in any of the four verify commands, `composeDigest` never references `userId` (grep confirms `userId` only appears inside `sendItemsDigest`) — i.e. it does not duplicate `listItems`' scoping/filtering, per the EM constraint.

## What QA should spot-check

1. **Audit semantics (Decision 1) under the differential.** Compare T-S2 (default placeholder: exactly one `items.digest_send_attempted`, zero `items.digest_sent`) against T-S10 (injected no-op stub: exactly one of each). The *only* variable between the two is which adapter is injected — confirms the placeholder itself is what blocks `items.digest_sent`, not some other code-path difference, and that the "sent" event is genuinely reachable (not dead code that happens to never run).
2. **No PII leak in audit metadata.** Independently re-check both event types' `metadata` (attempted and sent) contain only `itemIds`/`itemCount`/`recipientHash` — no `content`, `title`, `subject`, `body`, or raw `recipient` substring anywhere in `JSON.stringify(event)` — using a case with realistic-looking item content and a realistic recipient address (T-S3/T-S4/T-S10 cover this; worth an independent manual pass).
3. **User scoping on the compose path.** Confirm `sendItemsDigest("u1", ...)` attempt-event `itemIds` never include another user's item IDs even when both users have items (T-S5/T-S6), and that `composeDigest` itself performs no re-scoping (it has no `userId` parameter at all — scoping is `listItems`' job alone, called once in `sendItemsDigest`).

## Rollback

Not exercised (no failure occurred). Per spec: delete the 3 new files; `git revert <this-commit>` is the one-shot equivalent since nothing else was touched. `grep -rn "digest" src/` returning nothing would confirm a clean rollback.

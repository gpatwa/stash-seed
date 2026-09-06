# QA Evidence — saved-item-folders

> Owner: QA Evidence Agent
> Status: ready for security
> Source diff: `bb8a1135ffb27ec48e1e7a96894ada5233b89a54` (branch `slice/saved-item-folders`)

All commands below were re-run independently by QA, not copied from
`03-implementation.md`. Numbers match the engineer's self-report; no
discrepancy was found.

## Commands run

In order, using the project's commands from `.agentic/LOCAL_COMMANDS.md`.

| # | Step | Project command | Result | Notes |
|---|------|-----------------|--------|-------|
| 1 | Typecheck | `npm run typecheck` | pass | `typecheck ok` |
| 2 | Targeted tests | `node --test test/folders.test.js` | pass | `tests 18, pass 18, fail 0` |
| 2 | Targeted tests | `node --test test/savedItems.test.js` | pass | `tests 19, pass 19, fail 0` |
| 3 | Full test suite | `npm test` | pass | `tests 76, pass 76, fail 0` — 5 suites: digest(15), folders(18), savedItems(19), server(9), summary(15) |
| 4 | Build | `npm run build` | pass | `build ok`; confirmed `folders.js` is registered in `scripts/build-check.mjs`'s `modules` array (line 10) and imports cleanly |
| 5 | Local regression | `npm run qa:mvp` | pass | typecheck + full suite, `tests 76, pass 76, fail 0` |
| 6 | Whitespace / diff check | `git diff --check bb8a113~1 bb8a113` | pass | no output, exit 0 |

Environment: Node v25.6.0, dependency-free (no `npm install` performed or
needed), no network calls made by any command.

## UI verification

Skipped — this repo is headless. There is no view layer anywhere in `src/`
(confirmed: `src/server.js` is a plain JSON HTTP API, no templates/HTML).
The architecture spec itself states "no view layer exists anywhere in
`src/`" as the reason no UI test plan was written. Nothing to verify.

## Safety invariant verification

| Invariant | Verification | Result |
|-----------|--------------|--------|
| 1 — Deletes are soft and recoverable | Folder deletion is a container delete, not an item delete; items are never removed by any folder operation. Confirmed via `test/folders.test.js` tests 10–11 (re-run, pass) and independently by reading `deleteFolder`/`clearFolderFromItems`: the sweep only nulls `folderId`, never touches `deletedAt` or removes item records. Folder records themselves are hard-deleted (Decision 3, an explicit, documented, Security-flagged argument that inv. 1 protects saved content, not the container) — this is a judgement call the architect flagged for Security to confirm, not a QA-decidable pass/fail. | pass (for items); Decision 3 (folder hard-delete) flagged to Security, see Deferred |
| 3 — Every delete is audited | `folders.deleted` fires on every successful `deleteFolder`, carrying `folderId`, `unfolderedCount`, `unfolderedItemIds`. Independently exercised (not just via the test suite) with real functions — see probe output below: 4 real audit events recorded (`folders.created`, `items.folder_assigned` x2, `folders.deleted`) with exact spec'd metadata shape, no name/content leakage. | pass |
| 4 — No item content in logs | Independently verified: ran `createFolder("u1","Secret Folder Name")`, `addItem` with "secret content" strings, `assignItemToFolder`, `deleteFolder`, then `JSON.stringify`'d all resulting audit events and grepped for both the folder name string and the item content string — neither appears anywhere in the log. Also confirmed no event carries a `name` key. Matches `test/folders.test.js` test 17. | pass |
| 5 — A user only ever affects their own items | **QA wrote and ran an independent probe** (not reusing test file code) exercising `assignItemToFolder` and `deleteFolder` directly for all three cross-user cases named in the spec. See "Cross-user probe" below — all three rejected correctly against the real, unmodified repo code. | pass |
| 7 — Server reachable only from host it runs on | Untouched by this slice (no HTTP routes added). Regression-checked implicitly: `test/server.test.js`'s loopback-bind tests (`entry point pins loopback…`, `running server binds loopback, not the wildcard address`) both still pass in the full-suite run (item 3 above). | pass (unaffected, regression-checked) |

Invariants 2 and 6 are not touched by this slice (no multi-item destructive
action, no AI/LLM adapter involved) — not applicable.

### Cross-user probe (invariant 5) — independent, non-vacuous

QA wrote a standalone probe script (`run_probe.mjs`, kept outside the repo
in QA's scratch area, not committed) that imports the real
`src/services/folders.js`, `savedItems.js`, `audit.js` and directly
exercises three scenarios:

- **A — my item → their folder**: `u1` calls `assignItemToFolder("u1", myItem, theirFolder)` where `theirFolder` belongs to `u2`.
- **B — their item → my folder**: `u1` calls `assignItemToFolder("u1", theirItem, myFolder)` where `theirItem` belongs to `u2`.
- **C — delete another user's folder**: `u1` calls `deleteFolder("u1", theirFolder)` where `theirFolder` belongs to `u2` and has an item assigned.

**Result against the real, unmodified repo code: all 12 assertions pass**
(rejection returns `false`, no mutation to the victim's record, no audit
event emitted for the rejected attempt, and — for case C — no unfoldering
sweep runs and the folder record survives).

**Non-vacuousness check (fail-first, applied to QA's own probe, per the
tdd-fail-first discipline):** to prove the probe would actually catch a
regression and isn't just trivially passing, QA made two copies of the
service files in a scratch directory and deliberately removed one
ownership check in each:

1. Copy 1: removed `folder.userId !== userId` from `assignItemToFolder` and from `deleteFolder` in `folders.js`.
   → Probe run: **6 of 12 assertions FAIL** (scenario A fully fails: cross-user assign succeeds, item is mutated, audit event fires; scenario C fully fails: folder deletion succeeds, folder record is gone, an audit event fires for `u1` even though the folder was `u2`'s). Scenario B still passes because its check lives in `savedItems.js`, untouched in this copy.
2. Copy 2: removed `item.userId !== userId` from `setItemFolder` in `savedItems.js` only.
   → Probe run: **3 of 12 assertions FAIL** (scenario B fails: `u1` can assign `u2`'s item into `u1`'s folder, the item is mutated, an audit event fires). Scenarios A and C still pass, as expected — their checks live elsewhere and are untouched.
3. Restored / re-ran against the real repo code: **all 12 pass** (shown above).

This confirms the probe is a real, discriminating check — it fails when
either of the two enforcement points is removed, and passes only against
the code that has both — not a check that would pass regardless of what
the source does.

**Is this covered by a permanent test, or is it a gap?** It is **already
covered** — `test/folders.test.js` tests 7, 8, and 9 assert exactly these
three scenarios (QA independently re-read the test bodies and re-ran the
file; all three passed as part of the 18/18 result in Commands run #2).
QA's probe is corroborating, independent evidence that the permanent
tests are not vacuous — it is not filling a gap, because no gap exists
here. **No new test needs to be written by Implementation for this
invariant.**

## Deferred / skipped

| Item | Why deferred | Owner |
|------|--------------|-------|
| Decision 3 — folders are hard-deleted (no `deletedAt`) | Architect's own §Risks flags this as an open judgement call on whether invariant 1 extends to the container entity, not just item content. QA confirms the *mechanism* works exactly as documented (items always survive; only the folder record and its name are lost) but the *policy* question ("should invariant 1 extend to folders") is Security's to decide, not QA's. | Security & Privacy Agent |
| Decision 4 — folder names excluded from audit metadata | Same status: Architect proposed exclusion under invariant 4's broader spirit (citing `digest.js`'s `recipientHash()` precedent), explicitly left open for Security to confirm rather than decide. QA confirms the *implementation* matches the *proposal* (no `name` key anywhere in audit output, verified independently above) — the question of whether the proposal itself is the right call is Security's. | Security & Privacy Agent |
| Risk 1 — `setItemFolder`/`clearFolderFromItems` are exported and could be called directly, bypassing `folders.js`'s validation/audit | Architect's own §Risks: accepted and documented via JSDoc, not enforced by the language (no package-private visibility in ESM). QA confirms both mechanics are individually user-scoped even if called directly (test 24/25 in `test/savedItems.test.js`, re-run, pass) so the worst outcome is a dangling `folderId` pointing at a folder that doesn't exist for that user — invisible to `listItems(userId)` and never a cross-user leak. Flagged by the Architect for Security to confirm the trade, not a QA blocker. | Security & Privacy Agent |
| UI verification | Repo is headless — no view layer in `src/`. | n/a |

## Debug logging check

Grepped `src/services/folders.js`, `src/services/savedItems.js`, and
`scripts/build-check.mjs` (the three files this slice modified/added in
`src/`+`scripts/`) for `console.*`. The only hit is the pre-existing,
intentional `console.log("build ok")` in `build-check.mjs` (not part of
this slice's diff — same line exists for the pass/fail report of the
build script itself). **No debug `console.log` was left in the new folder
code.**

## Recommendation

- [x] Pass to Security & Privacy Agent
- [ ] Block — return to <agent> for <reason>

**Go.** Every command in the local regression sequence passed under
independent re-execution, matching the engineer's reported numbers
exactly (18/18, 19/19, 76/76, build ok, qa:mvp green). All three folder
audit events fire correctly with spec'd metadata and no content/name
leakage. The invariant-5 cross-user paths were independently probed
(not just trusted from the test file) and confirmed correctly rejected,
and the probe itself was proven non-vacuous by injecting two different
real regressions and watching it catch both. No debug logging left
behind. The two open items (Decisions 3 and 4) are exactly what the
Architect already flagged as judgement calls for Security to confirm —
not implementation defects — and are handed off as such, not smoothed
over.

## Hand off

Next agent: Security & Privacy Agent.

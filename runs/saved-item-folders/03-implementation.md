# Implementation — saved-item-folders

> Owner: Backend Architect (Implementation, stage 4)
> Status: done, ready for QA Evidence
> Source: `runs/saved-item-folders/02-architecture.md`
> Date: 2026-09-05

---

## What was built

Exactly the five files named in the architecture spec's hand-off table. No
redesign, no deviation.

| File | Change |
|------|--------|
| `src/services/folders.js` | **new** — `folders` `Map`, `createFolder`, `listFolders`, `assignItemToFolder`, `deleteFolder`, `_getFolder`, `_reset`. Imports `recordAuditEvent` from `audit.js` and `setItemFolder`/`clearFolderFromItems` from `savedItems.js`. No other imports. |
| `test/folders.test.js` | **new** — the 18 spec'd test cases (1–18), verbatim intent. |
| `src/services/savedItems.js` | modified — `addItem` now stores `folderId: null`; `listItems(userId, options = {})` gains the key-presence folder filter (byte-for-byte unchanged for the one-argument call); new `setItemFolder` and `clearFolderFromItems` mechanics, both unaudited by design. |
| `test/savedItems.test.js` | modified — **appended** 7 new tests (19–25); zero existing tests edited; added `setItemFolder` to the import list at the top (the only edit to the pre-existing block). |
| `scripts/build-check.mjs` | modified — one line added to `modules`: `"../src/services/folders.js"`. |

Implemented as specified, with no deviation from the architecture doc. I
have no disagreement with the design to flag — Decision 1 (ownership
direction), Decision 2 (eager unfoldering), Decision 3 (hard-delete
folders), and Decision 4 (no folder name in audit metadata) were all
followed as written.

### Audit events (all three, metadata exactly as specified)

| Event | Emitted from | Metadata | Emitted only on |
|---|---|---|---|
| `folders.created` | `createFolder` | `{ folderId }` | success (always, since input is validated first) |
| `items.folder_assigned` | `assignItemToFolder` | `{ itemId, folderId }` (`folderId` may be `null`) | `true` return only |
| `folders.deleted` | `deleteFolder` | `{ folderId, unfolderedCount, unfolderedItemIds }` | `true` return only |

No content, no folder name, in any metadata — verified by test 17
(`invariant 4 — no content in audit`) via JSON-serializing every event's
metadata and asserting the item content string is absent and no `name` key
exists.

### User scoping

All six enforcement points from the spec's table are implemented exactly as
described: `createFolder` stamps `userId` at construction (no parameter to
override it), `listFolders` filters by `userId`, `assignItemToFolder`
validates the folder's ownership before calling `setItemFolder` (which
independently validates the item's ownership and live state), `deleteFolder`
validates folder ownership before sweeping or deleting, `clearFolderFromItems`
filters on both `userId` and `folderId` as defence in depth, and
`listItems`'s existing `userId` clause runs regardless of the folder filter.
Every scoping rejection returns `false` (never throws), matching
`softDeleteItem`'s convention.

---

## Fail-first evidence (tdd-fail-first discipline)

Per test file, in order: write test + implementation together, isolate the
implementation via `git stash push -- <file>` (keeping the test file in the
working tree), run the new test file and read the real failure, restore with
`git stash pop`, re-run and confirm green.

### `test/folders.test.js` (new file, new module `src/services/folders.js`)

- **Isolate:** `git stash push -u -- src/services/folders.js` (the `-u` flag
  was required because the file was untracked — a plain `git stash push --
  <path>` does not pick up untracked files). This removed `folders.js` from
  disk entirely while `test/folders.test.js` stayed in place.
- **Fail-first run:** `node --test test/folders.test.js`
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '/Users/gopalpatwa/opt/stash-seed/src/services/folders.js' imported from
  /Users/gopalpatwa/opt/stash-seed/test/folders.test.js
  ...
  ✖ test/folders.test.js (75.026917ms)
  ℹ tests 1
  ℹ pass 0
  ℹ fail 1
  ```
  This is the expected class of failure: the feature (the module itself)
  does not exist yet, not an unrelated typo/import bug in the test.
- **Restore:** `git stash pop` — `src/services/folders.js` back on disk.
- **Green run:** `node --test test/folders.test.js` → `tests 18, pass 18,
  fail 0`.

### `test/savedItems.test.js` (modified `src/services/savedItems.js`)

- **Isolate:** `git stash push -- src/services/savedItems.js` (tracked file,
  no `-u` needed). This reverted `savedItems.js` to its pre-slice state
  (`listItems(userId)` one-arg only, no `setItemFolder`, no
  `clearFolderFromItems`, no `folderId` field) while
  `test/savedItems.test.js` (with the new import of `setItemFolder` and the
  7 new tests) stayed as edited.
- **Fail-first run:** `node --test test/savedItems.test.js`
  ```
  SyntaxError: The requested module '../src/services/savedItems.js' does
  not provide an export named 'setItemFolder'
  ...
  ✖ test/savedItems.test.js (77.321125ms)
  ℹ tests 1
  ℹ pass 0
  ℹ fail 1
  ```
  Same class: the ESM loader fails at import time because the feature
  (`setItemFolder`) genuinely does not exist yet on the un-stashed module —
  not a typo in the test file. This failure necessarily takes down the
  whole suite (all pre-existing tests in the file too, since the static
  import fails before any test body runs); that is a property of ESM
  static imports, not evidence of a broken pre-existing test.
- **Restore:** `git stash pop` — `savedItems.js` back to the modified state.
- **Green run:** `node --test test/savedItems.test.js` → `tests 19, pass
  19, fail 0` (12 pre-existing + 7 new).

I did not apply this ritual to `folders.js`'s trivial getters
(`listFolders`, `_getFolder`) or to `_reset` — only to the real behavioural
logic: `createFolder`'s validation, `assignItemToFolder`'s two-sided
ownership check and reassignment/unfoldering semantics, `deleteFolder`'s
eager sweep, and `listItems`'s new options-based filter — per the brief's
instruction to reserve the discipline for real feature logic.

---

## Command output (in order run)

### 1. Targeted new test files

`node --test test/folders.test.js` → `tests 18, pass 18, fail 0`
`node --test test/savedItems.test.js` → `tests 19, pass 19, fail 0`

### 2. `npm run typecheck`

```
> stash-seed@0.1.0 typecheck
> for f in $(find src scripts -type f \( -name '*.js' -o -name '*.mjs' \)); do node --check "$f" || exit 1; done; echo "typecheck ok"

typecheck ok
```

### 3. `npm test` (full suite)

```
ℹ tests 76
ℹ suites 0
ℹ pass 76
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

All five suites green: `digest.test.js` (15), `folders.test.js` (18),
`savedItems.test.js` (19), `server.test.js` (9), `summary.test.js` (15).
76 = 15+18+19+9+15.

### 4. `npm run build`

```
> stash-seed@0.1.0 build
> node scripts/build-check.mjs

build ok
```

`folders.js` is registered in `scripts/build-check.mjs`'s `modules` array
and imports cleanly.

### 5. `npm run qa:mvp`

```
> stash-seed@0.1.0 qa:mvp
> npm run typecheck && npm run test

typecheck ok
...
ℹ tests 76
ℹ pass 76
ℹ fail 0
```

All green.

---

## Commit

- **Branch:** `slice/saved-item-folders` (created from `main`; `main` has
  branch protection, no direct commit was made to it).
- **Files committed:** `src/services/folders.js`, `test/folders.test.js`,
  `src/services/savedItems.js`, `test/savedItems.test.js`,
  `scripts/build-check.mjs`, and this run folder's artefacts
  (`runs/saved-item-folders/`). No other files touched.
- **Not committed:** pre-existing unstaged changes to
  `.claude/agentic.config.json`, `.claude/protocols/PIPELINE_SLOS.md`,
  `.claude/protocols/SLICE_STATE.md`, `runs/ANALYTICS.md`,
  `runs/dashboard.html` — present in the working tree before this stage
  started, out of this stage's scope, left untouched and unstaged.
- Commit hash: see stage report / `git log -1` on this branch.

## Handoff

Next: QA Evidence Agent, per `runs/saved-item-folders/STATE.md`. No open
implementation questions — Decisions 3 and 4 remain flagged (by the
Architect) for Security to confirm, not for this stage to resolve.

---

## Rework — Security round 1

> Source: `runs/saved-item-folders/05-security-review.md` (Security & Privacy
> Agent, verdict GO conditional on SEC-1 and SEC-2). SEC-3 and the six
> advisories are out of scope for this rework (SEC-3 is an EM/human rule-4
> approval item; advisories are recorded for a future slice).

### SEC-1 — `clearFolderFromItems` userId clause had zero test coverage

Added one test to `test/savedItems.test.js` (new case, imports
`clearFolderFromItems`): two users each hold an item whose `folderId` is the
same string (`"fld_1"`, set directly via the unaudited `setItemFolder`
mechanic to reproduce a folder-id collision across users — the exact scenario
Security's scratch-mutation proof used). `clearFolderFromItems("u1",
"fld_1")` must clear only u1's item and leave u2's item's `folderId` intact.

**Fail-first evidence:** removed the `item.userId === userId` clause from
`clearFolderFromItems` (`src/services/savedItems.js:121`, changing the guard
to `if (item.folderId === folderId)`), leaving the new test in place.
`node --test test/savedItems.test.js` → **19 pass, 1 fail**, real failure:

```
✖ clearFolderFromItems does not clear another user's item sharing the same folderId
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [
      'item_1',
  +   'item_2'
    ]
  actual: [ 'item_1', 'item_2' ], expected: [ 'item_1' ]
```

u2's item (`item_2`) was swept in exactly as Security's proof predicted.
Restored the clause; `node --test test/savedItems.test.js` → **20 pass, 0
fail**.

### SEC-2 — "invariant 4" test didn't assert the folder name was absent

Added `assert.ok(!serialized.includes("Secret Folder Name"), ...)` inside the
existing loop in `test/folders.test.js`'s `invariant 4 — no content in audit`
test, mirroring the pre-existing item-content assertion.

**Fail-first evidence:** temporarily changed `createFolder`'s audit call
(`src/services/folders.js:27`) to `recordAuditEvent(userId, "folders.created",
{ folderId, label: name })`, leaving the fixed test in place.
`node --test test/folders.test.js` → **2 failures** (the pre-existing
`audit shape — create` deep-equal test, as expected/unrelated, plus the
target test with the new assertion):

```
test at test/folders.test.js:223:1
✖ invariant 4 — no content in audit (0.120208ms)
  AssertionError [ERR_ASSERTION]: folder name string must not appear anywhere in audit metadata
  actual: false, expected: true
```

This is exactly the failure SEC-2 asked for: the fixed test now catches the
leak on its own, not incidentally via the unrelated shape test. Restored
`folders.js`; `node --test test/folders.test.js` → **18 pass, 0 fail**.

### Full-suite confirmation

After restoring both files: `npm test` → **77 pass, 0 fail** (76 baseline +
1 new SEC-1 test; SEC-2 modified an existing test, no count change from it).
`npm run typecheck` → `typecheck ok`. `npm run build` → `build ok`.
`npm run qa:mvp` → typecheck ok, 77 pass, 0 fail.

`git status` confirms `src/` is unmodified — both fail-first mutations were
made and reverted in place on tracked files, verified back to their
committed content before running the full suite or committing.

### Commit

- **Files committed:** `test/savedItems.test.js`, `test/folders.test.js`.
  No `src/` changes (both fixes are test-only and additive, as Security
  required).
- **Commit hash:** `b3ec7c154faee955d257bbbbb036dd45c11a7a2d`
- **Not committed:** the same pre-existing out-of-scope working-tree changes
  noted in the original Implementation stage above, still untouched.

### Handoff

Next: Release Manager, per Security's hand-off. SEC-3 remains routed
separately to EM → Orchestrator → human as a rule-4 approval request and does
not gate this release.

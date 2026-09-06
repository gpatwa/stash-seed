# Tech Spec — saved-item-folders

> Owner: Software Architect Agent
> Status: ready for implementation
> Source feature + scope specs: `runs/saved-item-folders/00-slice-plan.md`,
> `runs/saved-item-folders/01-scope-review.md`
> Date: 2026-09-06

---

## Summary

Add a private, per-user folder entity and a single-membership item↔folder
relationship, so a user can group live saved items without any change to
existing item behaviour.

The design turns on one decision: **the `folderId` field lives on the item
record, and a new `src/services/folders.js` depends one-directionally on
`src/services/savedItems.js`.** That keeps `listItems`' folder filter a
pure read of a field `savedItems.js` already owns — so `savedItems.js`
never needs to know that folders exist as an entity, and the circular
import the EM flagged (§ 1 of *Architecture must genuinely run*) cannot
form. `folders.js` joins `digest.js` and `summary.js` as the third module
that composes over `savedItems.js`; the dependency graph stays a DAG with
exactly the shape it has today.

No persistence work, no store redesign, no adapter, no new dependency. The
in-memory `Map` stays. Two new files, three modified — inside the EM's
5-file budget.

---

## Decision 1 — ownership direction (the load-bearing call)

**Decision: a new `src/services/folders.js` owns the folder entity and is
the public entry point for the folder↔item relationship. It imports from
`savedItems.js`. `savedItems.js` imports nothing new.**

```
                    audit.js
                   ↗   ↑   ↖
      savedItems.js     |    digest.js ──┐
            ↑           |    summary.js ─┤→ savedItems.js
            └───────────┴──── folders.js ┘   (all one-directional)
```

Import direction after this slice, stated explicitly for the gate:

| Module | Imports |
|--------|---------|
| `audit.js` | (nothing) |
| `savedItems.js` | `audit.js` |
| `digest.js` | `savedItems.js`, `audit.js`, `emailAdapter.js` |
| `summary.js` | `savedItems.js`, `audit.js` |
| **`folders.js` (new)** | **`savedItems.js`, `audit.js`** |

**There is no cycle.** `folders.js` is a leaf; nothing imports it except
`scripts/build-check.mjs` and `test/folders.test.js`.

### Why this direction and not "extend `savedItems.js`"

1. **The filter needs a field, not an entity.** `listItems` filters on
   `i.folderId === options.folderId` — a scalar comparison against a field
   on a record `savedItems.js` already owns. It never asks "does this
   folder exist?" or "who owns it?". That question only arises at *assign*
   time, and assign lives in `folders.js`. This is what makes the
   one-directional graph possible at all: **filtering needs no folder
   knowledge; only validation does, and validation lives on the folders
   side.**
2. **It matches every existing dependency in this repo.** `digest.js` and
   `summary.js` are both "a capability that composes over saved items."
   Folders is a third instance of that exact shape. Choosing the other
   direction would make `savedItems.js` the first module here to import a
   capability module — a new pattern, adopted for no gain.
3. **Extending `savedItems.js` is the option that risks the cycle.** If
   `savedItems.js` owned folder records *and* the relationship, the file
   grows from 83 to ~160 lines and mixes two entities; if it owned only
   the relationship while `folders.js` owned the entity, `savedItems.js`
   would have to import `folders.js` to validate a folderId, while
   `folders.js` imports `savedItems.js` to unfolder on delete — that is
   the cycle, exactly as the EM predicted.
4. **The single-membership *policy* is not foreclosed.** Membership is a
   scalar `folderId` on the item, so a future many-to-many is a change of
   that field's representation inside `savedItems.js` plus a new set of
   functions in `folders.js` — no consumer of `folders.js` changes shape.
   Per the EM's constraint: designed so single-membership is a policy, not
   built for many-to-many now.

### The one seam this creates, stated honestly

`folders.js` cannot reach into `savedItems.js`'s private `Map`. So
`savedItems.js` exports two narrow, user-scoped mechanics —
`setItemFolder` and `clearFolderFromItems` (§ Service surface). These are
**mechanics, not a second public API**: they perform no folder validation
(they cannot — that would require importing `folders.js`), and they emit
no audit events. `folders.js` is their only caller in this repo, and it
owns validation and auditing. This is written in the JSDoc on both
functions so a future reader does not mistake them for an entry point.

**Rejected alternative:** having `folders.js` mutate item records through
the existing `_getItem` test helper. That leaks store internals to a
second module, bypasses user-scoping, and abuses a helper documented as
test/inspection-only. Two explicit exports are cheaper than that.

---

## Decision 2 — eager unfoldering on folder delete

**Decision: eager.** `deleteFolder` walks the user's item records and
nulls `folderId` on every item carrying the deleted folder, before the
folder record is removed.

**Rationale (one line, as asked):** lazy unfoldering would require
`listItems` to ask "does this folderId still exist?" — which forces
`savedItems.js` to import `folders.js` and creates the exact circular
import Decision 1 exists to avoid. Eager is not merely tidier; it is the
only option consistent with a one-directional graph.

Secondary: eager leaves no dangling references, so the store is always
self-consistent and `test/folders.test.js` can assert the post-condition
directly rather than asserting a read-time behaviour.

The sweep covers **soft-deleted items too**, not just live ones — a
soft-deleted item retains its `folderId` today, and leaving it pointing at
a removed folder would be the one dangling reference eager unfoldering
exists to prevent. This is why the sweep is `clearFolderFromItems` inside
`savedItems.js` (which can see the whole `Map`) rather than
`listItems(...)` in `folders.js` (which is `deletedAt`-filtered by
design and must stay that way).

---

## Decision 3 — folder records are hard-deleted

**Decision: `deleteFolder` removes the folder record from the `Map`. No
`deletedAt` on folders.**

Invariant 1 is engaged and I am arguing explicitly that it does not extend
to the container, per the EM's instruction:

- **Invariant 1 protects content the user cannot recreate.** Its own text
  is about the record being *retained* so the saved item survives. A
  folder holds no content of its own — a name and an id. Every item that
  was in it survives untouched and readable (success criterion 4). Nothing
  a user saved is lost or made unreachable by a folder delete.
- **Soft-deleting folders buys nothing here.** There is no restore surface
  in this repo ("Not yet built: Restore / undo, trash view"), and the slice
  plan excludes building one. A `deletedAt` on folders would mean every
  folder read filters it, plus a new undefined question ("are items in a
  soft-deleted folder still in it?"), for zero user-reachable recovery.
- **The effect is fully reconstructible from the audit log.** The
  `folders.deleted` event records the folderId, the count, and the exact
  itemIds unfoldered (§ Audit events) — so an auditor can reconstruct what
  changed without the folder record.

**What is genuinely lost:** the folder's *name*, because Decision 4 keeps
names out of audit metadata. I accept that: a folder name is a label the
user chose to delete, not content they saved, and re-creating a folder is
one call. Flagged to Security as a conscious pair of decisions (3 + 4)
rather than an accident.

Invariant 3 is honoured regardless of hard vs soft: the delete is audited.

---

## Decision 4 — folder names do NOT go into audit metadata

**Proposal to Security (EM: "Architect proposes, Security confirms"):
audit metadata for all three folder events carries ids and counts only.
No `name` field.**

Invariant 4's letter says "never the saved content," and a folder name is
not item content — so this is a genuine boundary question, not a settled
one. I resolve it toward exclusion:

1. **This repo already reads invariant 4 as broader than its letter.**
   `digest.js` does not log the recipient address; it logs
   `recipientHash()` — a truncated SHA-256. An email address is not "item
   content" either, and the repo still refused to put it in the log. That
   is the house precedent for user-authored strings, and it points one way.
2. **A folder name can be exactly as sensitive as an item.** "Medical
   bills", "Job hunt", "Divorce". The audit log is append-only and never
   redacted; anything that enters it is permanent.
3. **Ids are sufficient for the log's actual job.** Correlating
   `folders.created` → `items.folder_assigned` → `folders.deleted` for one
   folder needs only `folderId`, which is stable across all three.

**Cost, stated:** a human reading the audit log sees `fld_3`, not
"Recipes". Accepted — the log's job is integrity and reconstruction, not
readability. If Security disagrees, the change is one metadata key in
`createFolder` and is not structural.

**Not hashed either.** A hash would be security theatre: the folder-name
space is small and guessable, so a hash offers little protection while
adding a field nobody can use. Omit rather than obscure.

---

## Data model deltas

| Type | Change | Rationale |
|------|--------|-----------|
| `Folder` | **new** — `src/services/folders.js` | The slice's new entity. Lives in the new module, in its own `Map`. |
| `SavedItem` | **modified** — one field added: `folderId` | Single-membership relationship. A scalar on the item is the minimal shape; reassignment replaces by construction (success criterion 2). |

### `Folder` (new)

```js
/** @type {Map<string, {folderId:string, userId:string, name:string}>} */
const folders = new Map();
let folderSeq = 0;   // ids: `fld_1`, `fld_2`, … — same counter shape as savedItems' `item_N`
```

| Field | Type | Notes |
|-------|------|-------|
| `folderId` | `string` | `fld_${++folderSeq}`. Globally unique across users. |
| `userId` | `string` | Owner. The only scoping key; a folder is private to one user, full stop. |
| `name` | `string` | User-authored, non-empty. **Not unique** — two folders may share a name; no constraint is enforced, and none is needed for v1. |

**Deliberately absent:** `createdAt`, `deletedAt`, `itemCount`, `parentId`,
`color`, `order`. `savedItems.js` has no `createdAt` either (`summary.js`
notes Map insertion order is the only notion of recency); adding one to
folders alone would be an inconsistency introduced for no consumer.
`deletedAt` is excluded by Decision 3, `parentId` by the nesting non-goal,
`itemCount` because it is derivable and would need invalidation.
`listFolders` returns Map insertion order, matching `listItems`.

### `SavedItem` (modified)

```js
// before
{ itemId, userId, content, deletedAt }
// after
{ itemId, userId, content, deletedAt, folderId }   // folderId: string | null
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `folderId` | `string \| null` | **`null`**, set in `addItem` | `null` = unfoldered. Never `undefined`. |

**Back-compat statement (closes EM § Done item 8, and the enterprise
"schema / data migration" gate for the right reason):**

- **There is no migration and no migration script.** The store is a
  process-lifetime in-memory `Map`. Nothing is persisted between runs, so
  no record predating this change can ever be read by the new code. The
  enterprise gate is **n/a because there is no schema and no stored data**,
  not because migration was skipped.
- `addItem` sets `folderId: null` explicitly at construction, so every
  record in the store carries the field. Implementers must not rely on
  `undefined` reading as unfoldered — set the field.
- **`GET /items` response shape changes additively.** `server.js:55`
  returns `listItems(userId)` results directly as JSON, so every item in
  the response gains `"folderId": null`. No `server.js` line changes.
  Verified against the real consumers:
  - `test/server.test.js`, `test/savedItems.test.js` — no whole-object
    `deepEqual` on an item; they assert `deleted`/`skipped` arrays and
    status fields.
  - `digest.js:34` maps to `{itemId, content}` explicitly — extra fields
    are dropped, `composeDigest`'s purity contract is unaffected.
  - `summary.js` reads `.content` and `.length` only.
  - `scripts/smoke.mjs:32` asserts `a.items.length >= 1` — a length check,
    no shape assertion.
  Precise success criterion, per the EM: *existing behaviour is unchanged;
  the item record shape is additively extended.* QA asserts this
  deliberately rather than inheriting it.

---

## Service surface

### New — `src/services/folders.js`

| Function | Signature | Invariant / behaviour |
|----------|-----------|----------------------|
| `folders.js:createFolder` | `(userId: string, name: string) => string` | Throws `TypeError("userId required")` / `TypeError("name required")` on missing or empty input — matches `bulkDeleteItems`' validate-then-work shape. Returns the new `folderId`. Emits `folders.created`. |
| `folders.js:listFolders` | `(userId: string) => Folder[]` | User-scoped filter, Map insertion order. Read-only, no audit. Returns `[]` for an unknown user — never throws on scoping. |
| `folders.js:assignItemToFolder` | `(userId: string, itemId: string, folderId: string \| null) => boolean` | The single entry point for the relationship. `folderId: null` unfolders. Returns `false` (never throws) when the folder is missing/not the caller's, or the item is missing/not the caller's/soft-deleted. Emits `items.folder_assigned` **only on `true`**. |
| `folders.js:deleteFolder` | `(userId: string, folderId: string) => boolean` | Eager-unfolders (Decision 2), then removes the folder record (Decision 3). Returns `false` for a missing folder or another user's folder, with **no sweep and no audit event**. Emits `folders.deleted` on `true`. |
| `folders.js:_getFolder` | `(folderId: string) => Folder \| undefined` | Test/inspection helper. Mirrors `savedItems.js:_getItem`. |
| `folders.js:_reset` | `() => void` | **Required** (EM § Done item 10). Clears the `Map` and resets `folderSeq = 0`, exactly like `savedItems.js:_reset`. Without it the new suite leaks folder state into `test/savedItems.test.js`. |

### Modified — `src/services/savedItems.js`

| Function | Signature | Invariant / behaviour |
|----------|-----------|----------------------|
| `savedItems.js:addItem` | `(userId, content) => string` — **unchanged signature** | Now stores `folderId: null`. |
| `savedItems.js:listItems` | `(userId: string, options?: { folderId?: string \| null }) => SavedItem[]` | **Optional second parameter — not a signature change.** `listItems(userId)` behaves exactly as today. |
| `savedItems.js:setItemFolder` | `(userId, itemId, folderId: string \| null) => boolean` | **Mechanic, not an entry point.** User-scoped like `softDeleteItem`: `if (!item \|\| item.userId !== userId \|\| item.deletedAt !== null) return false`. Does **not** validate that `folderId` exists — `folders.js` does, before calling. Emits **no** audit event. |
| `savedItems.js:clearFolderFromItems` | `(userId, folderId: string) => string[]` | **Mechanic.** Walks the whole `Map` (including soft-deleted records), nulls `folderId` on every record where `userId` **and** `folderId` match, returns the cleared itemIds in Map order. Emits **no** audit event. |
| `savedItems.js:softDeleteItem`, `bulkDeleteItems`, `_getItem`, `_reset` | unchanged | `_reset` still clears the whole `Map`, so it covers the new field for free. |

### `listItems` — the exact filter semantics (hard constraint)

The EM's hard constraint: three shipped modules call `listItems(userId)`
positionally. A grep of the repo found **five** call sites in shipped and
script code, not three — `digest.js:86`, `summary.js:132`, `server.js:55`,
plus `scripts/drill/regressed-server.mjs:31` and `:37` (the rollback
drill's deliberately-regressed build, which must keep working for
`npm run rollback:drill` to remain meaningful). All five pass exactly one
argument. **All five are untouched by this change.**

An **options object**, not a positional `folderId`. Reason: `null` is a
meaningful filter value ("unfoldered items only"), so a positional second
argument would have to distinguish `null` from `undefined` to also express
"no filter" — fragile and easy to get wrong at a call site. Key-presence on
an options object states the difference explicitly:

```js
export function listItems(userId, options = {}) {
  const byFolder = Object.prototype.hasOwnProperty.call(options, "folderId");
  return [...items.values()].filter(
    (i) =>
      i.userId === userId &&
      i.deletedAt === null &&
      (!byFolder || i.folderId === options.folderId),
  );
}
```

| Call | Meaning |
|------|---------|
| `listItems("u1")` | All live items. **Byte-for-byte today's behaviour** — the regression guard for the five call sites. |
| `listItems("u1", {})` | Same as above. |
| `listItems("u1", { folderId: "fld_1" })` | Live items in `fld_1`. |
| `listItems("u1", { folderId: null })` | Live **unfoldered** items. |

Unknown/other-user `folderId` returns `[]` — the `userId` clause runs
first, so it can never leak another user's items even if a folderId were
guessed.

---

## Adapter boundaries

**None. n/a for this slice — stated rather than left open, and I do not
disagree with the EM's expected answer.**

| Boundary | Default adapter | Placeholder behaviour |
|----------|-----------------|------------------------|
| (none) | — | — |

Folders are a deterministic, in-process data-model change: no external
system, no network, no model, no I/O, no non-determinism, and nothing a
future slice would plausibly want to swap an implementation for. The two
adapter seams in this repo exist because each fronts a capability that
*cannot* be done in-process — `PlaceholderEmailAdapter` (sending mail) and
`PlaceholderLlmSummarizer` (a model call). Neither condition applies here.

Inventing a `FolderStoreAdapter` or repository abstraction would be
future-proofing beyond the scope, and the EM's cap on this stage names it
directly ("no persistence layer, no ORM, no adapter, no repository
abstraction"). Invariant 6 is untouched — this slice adds no AI capability,
and the existing placeholders keep throwing.

---

## Audit / feedback / usage events

Closes the `RELEASE_GATES.md` Architecture gate ("Audit / feedback / usage
events listed") and the EM's open question. **Decision: audit all three
state-changing folder operations.** The EM's steer was to audit all three;
I reach the same answer independently — every state-changing operation in
this codebase emits an event (`items.deleted`, `items.bulk_deleted`,
`items.digest_send_attempted`, `items.digest_sent`, `items.summarized`),
and invariant 3 makes folder deletion the non-negotiable one.

All three go through `recordAuditEvent(userId, type, metadata)` from
`audit.js`. **No parallel audit path is created.** Naming follows the
existing `<entity>.<past_tense_action>` snake_case convention.

| Event type | Emitted from | Metadata fields | Notes |
|------------|--------------|-----------------|-------|
| `folders.created` (audit) | `folders.js:createFolder` | `folderId` | No `name` — Decision 4. Emitted after the record is in the `Map`, before returning. |
| `items.folder_assigned` (audit) | `folders.js:assignItemToFolder` | `itemId`, `folderId` | `folderId` is `null` when unfoldering. Prefixed `items.` because the mutated record is the item — same convention as `digest.js` emitting `items.digest_send_attempted` from a non-`savedItems` module. |
| `folders.deleted` (audit) | `folders.js:deleteFolder` | `folderId`, `unfolderedCount`, `unfolderedItemIds` | Satisfies invariant 3. The count + id list make the delete's full effect reconstructible without the folder record (Decision 3). Mirrors `items.bulk_deleted`'s count-plus-ids shape. |

### Every state-changing function has an entry (quality bar)

| State-changing function | Audit |
|---|---|
| `folders.js:createFolder` | `folders.created` |
| `folders.js:assignItemToFolder` | `items.folder_assigned` |
| `folders.js:deleteFolder` | `folders.deleted` |
| `savedItems.js:setItemFolder` | **none by design** — a mechanic that cannot validate the folder it is writing. Auditing here would let a direct caller record an assignment to a folder that does not exist. Its audit is `items.folder_assigned`, emitted by its only caller after validation. |
| `savedItems.js:clearFolderFromItems` | **none by design** — its effect is carried in `folders.deleted`'s `unfolderedItemIds`. Per-item events here would emit N assignment events for one user gesture; `bulkDeleteItems` sets the precedent that a batch gets **one** summary event. |
| `savedItems.js:addItem` | none — unchanged; adding one is out of scope for this slice. |

### Rules that apply to all three

- **Emit only on success.** A call returning `false` (missing folder,
  cross-user, soft-deleted item) emits **nothing** — matching
  `softDeleteItem`, which audits only when it actually deletes. A rejected
  operation must not appear in the log as one that happened.
- **Emit after the mutation, never before.** No folder operation has
  `digest.js`'s attempt/outcome split, because none of them can fail
  partway: there is no adapter, no I/O, nothing that throws between the
  write and the event.
- **Metadata carries ids and counts only** — no item content (invariant 4),
  and no folder name (Decision 4).
- **The event is scoped to the acting user** via `recordAuditEvent`'s
  `userId`, which is the same `userId` that passed the scoping check.

---

## User-scoping enforcement points (invariant 5)

Invariant 5 is the primary risk in this slice: folders introduce a second
ID space and therefore a new way to cross the user boundary. Every new
function's check, including the four cross-user cases the EM named:

| # | Operation | Where the check is | Behaviour |
|---|-----------|--------------------|-----------|
| 1 | `createFolder` | The record is stamped `userId` at construction; the caller cannot create a folder owned by anyone else — there is no parameter for it. | n/a |
| 2 | `listFolders` | `folders.values().filter(f => f.userId === userId)` | Another user's folders are invisible, not error-producing. |
| 3a | **Assign my item → another user's folder** | `assignItemToFolder`: `const folder = folders.get(folderId); if (!folder \|\| folder.userId !== userId) return false;` — **before** any call to `setItemFolder`. | `false`. No mutation, no audit. |
| 3b | **Assign another user's item → my folder** | `setItemFolder`: `if (!item \|\| item.userId !== userId \|\| item.deletedAt !== null) return false;` — the `softDeleteItem` shape, verbatim. | `false` propagates out of `assignItemToFolder`. No mutation, no audit. |
| 4 | **Delete another user's folder** | `deleteFolder`: `if (!folder \|\| folder.userId !== userId) return false;` — **before** the sweep and before the `Map.delete`. | `false`. No unfoldering, no removal, no audit. |
| 5 | `clearFolderFromItems` (sweep) | Filters on `i.userId === userId && i.folderId === folderId` — both, not just the folderId. | Defence in depth. Folder ids come from one global counter so a cross-user collision cannot occur today; the check costs nothing and survives any future id scheme. |
| 6 | `listItems(userId, {folderId})` | The existing `i.userId === userId` clause is evaluated for every record regardless of the folder filter. | A guessed folderId returns `[]`, never another user's items. |

**Ordering is load-bearing:** in `assignItemToFolder`, folder validation
runs first and mutates nothing; `setItemFolder` then validates the item
before writing. So there is no path that half-applies — a rejected call
leaves the store byte-identical.

**No leaky errors.** Every scoping rejection returns `false`, never throws
and never reports *why* — matching `softDeleteItem`. A caller cannot
distinguish "that folder does not exist" from "that folder is not yours",
so the API does not confirm the existence of another user's records.
`TypeError` is reserved for malformed input (missing `userId`/`name`),
never for scoping, exactly as `bulkDeleteItems` does it.

---

## Integration points

Existing services this slice calls:

- **`src/services/savedItems.js`** — `folders.js` calls `setItemFolder`
  (assignment) and `clearFolderFromItems` (eager unfoldering on delete).
  The only two functions it touches; it never reads the item `Map`
  directly and never reads item `content`.
- **`src/services/audit.js`** — `recordAuditEvent` for all three folder
  events, reused as-is. No parallel audit path
  (`CURRENT_MVP_STATUS.md`'s standing constraint).
- **`scripts/build-check.mjs`** — one line added to the `modules` array:
  `"../src/services/folders.js"`. The array enumerates shipped modules
  explicitly; omitting it means `npm run build` never proves the new
  module imports cleanly.

Consumers affected **without any code change** (see back-compat above):
`src/server.js` (`GET /items` gains `folderId` in each item),
`src/services/digest.js`, `src/services/summary.js`,
`scripts/smoke.mjs`, `scripts/drill/regressed-server.mjs`.

**Not integrated, deliberately:** `src/server.js` gains **no folder
routes**. HTTP exposure is out of scope per the EM's § Scope correction
and is a separate later slice. An implementer who finds themselves editing
`server.js` has left the slice.

---

## Test plan

Suites named against real files. Runner: `node --test` via `npm test`.

### New — `test/folders.test.js`

Imports `_reset as resetFolders` from `folders.js`, `_reset as resetItems`
from `savedItems.js`, `_reset as resetAudit` from `audit.js`, and calls all
three at the top of every test — the established per-test reset pattern in
`test/savedItems.test.js`.

| # | Test | Asserts |
|---|------|---------|
| 1 | create a folder, it appears in `listFolders` | returns a `folderId`; `listFolders` length 1, `name` matches |
| 2 | `createFolder` rejects bad input | `TypeError` on empty/missing `userId`; `TypeError` on empty/missing `name` |
| 3 | folders are user-scoped | `u2`'s `listFolders` does not contain `u1`'s folder (success criterion 1) |
| 4 | assign, then list by folder | `listItems("u1", {folderId})` returns just that item |
| 5 | reassignment replaces, never accumulates | after two assigns, `_getItem(id).folderId` is the second folder; first folder's filtered list is empty (success criterion 2) |
| 6 | unfoldering | `assignItemToFolder(u, item, null)` → `folderId === null`; item appears in `listItems(u, {folderId: null})` |
| 7 | **cross-user: my item → their folder** | returns `false`; `_getItem` unchanged; **no audit event recorded** |
| 8 | **cross-user: their item → my folder** | returns `false`; `_getItem` unchanged; **no audit event recorded** |
| 9 | **cross-user: delete their folder** | returns `false`; `_getFolder` still present; their items keep their `folderId`; no audit event |
| 10 | delete folder leaves items intact | items survive with `deletedAt === null` and `folderId === null`; `_getItem` still returns them (success criterion 4) |
| 11 | delete folder unfolders soft-deleted items too | a soft-deleted item that was in the folder has `folderId === null` afterwards |
| 12 | folder record is gone after delete | `_getFolder(folderId) === undefined`; `listFolders` no longer contains it |
| 13 | assigning to a nonexistent folder | returns `false`; no mutation; no audit event |
| 14 | **audit shape — create** | one `folders.created`, metadata `{folderId}` **only** |
| 15 | **audit shape — assign** | one `items.folder_assigned`, metadata `{itemId, folderId}` |
| 16 | **audit shape — delete** | one `folders.deleted` with `folderId`, `unfolderedCount`, `unfolderedItemIds` matching the real ids |
| 17 | **invariant 4 — no content in audit** | assert no event's serialized metadata contains an item's `content` string, and no event carries a `name` key (Decision 4) |
| 18 | **invariant 5 — audit is user-scoped** | `listAuditEvents("u2")` is empty after `u1` does all three operations |

### Modified — `test/savedItems.test.js`

| # | Test | Asserts |
|---|------|---------|
| 19 | new items default to unfoldered | `_getItem(addItem(...)).folderId === null` (never `undefined`) |
| 20 | **`listItems(userId)` one-argument regression guard** | with a mix of foldered and unfoldered items, `listItems("u1")` returns **all** of them — the guard for the five existing call sites (success criterion 3, second half) |
| 21 | `listItems(userId, {})` === `listItems(userId)` | same set |
| 22 | `{folderId: null}` returns only unfoldered items | distinguishes key-absent from `folderId: null` |
| 23 | folder filter respects `deletedAt` | a soft-deleted item in a folder is not returned by the filtered list |
| 24 | `setItemFolder` is user-scoped | another user's itemId → `false`, no mutation |
| 25 | `setItemFolder` refuses a soft-deleted item | `false`, `folderId` unchanged |

**Existing tests in this file must not be edited** — only new tests
appended. If an existing assertion needs changing, the record-shape change
was larger than scoped: stop and escalate to the EM (EM success criterion 7).

### Regression — must pass **unmodified**

`test/digest.test.js`, `test/summary.test.js`, `test/server.test.js`.
Editing any of the three is the EM's escalation trigger, not a fix.

### Commands (Engineer runs all four)

```
npm run typecheck    # node --check over src/ + scripts/
npm test             # node --test — full suite
npm run build        # build-check.mjs — must include folders.js
npm run qa:mvp       # typecheck + test, the QA regression gate
```

### Not in the test plan, and why

- **Manual UI checks:** n/a — no view layer exists anywhere in `src/`.
- **Eval cases:** n/a — no adapter, no model, nothing non-deterministic.
- **Smoke / HTTP tests for folders:** n/a — no folder endpoints ship in
  this slice. `npm run smoke` and `npm run rollback:drill` remain valid
  regression checks and need no edit (`smoke.mjs` asserts item-list
  *length*, not item shape — verified).

---

## Rollback plan

Executable from this document alone, without the slice author.

**Preconditions to know before starting:** the store is a process-lifetime
in-memory `Map`. Nothing is persisted, so **there is no data to roll back
and no migration to reverse**. Rolling back the code rolls back everything.
No user data can be lost by this rollback, and no user data survives a
restart either way.

1. **Identify the merge commit.** `git log --oneline -- src/services/folders.js`
   — the slice landed as a branch + PR onto `main` (branch protection is
   live; there is no direct push to find).
2. **Revert it.** `git revert -m 1 <merge-sha>` for a merge commit, or
   `git revert <sha>` if it landed as a squash. This removes
   `src/services/folders.js` and `test/folders.test.js`, restores
   `listItems` to its one-parameter form, drops `folderId` from `addItem`,
   removes `setItemFolder` / `clearFolderFromItems`, and un-registers
   `folders.js` from `scripts/build-check.mjs`.
3. **Verify locally before pushing:** `npm run qa:mvp && npm run build`.
   Expected: `typecheck ok`, full suite green, `build ok`. If
   `build-check.mjs` still lists `folders.js` after the revert, the revert
   was partial — fix that line by hand and re-run; a stale entry there
   fails the build with a module-not-found error, which is the intended
   loud failure.
4. **Land the revert the same way the slice landed:** branch + PR, with the
   "Release gates" CI check passing. `main` is protected — a revert cannot
   be force-pushed.
5. **Restart any running process.** `npm start`. Because the store is
   in-memory, the restart clears all items and folders regardless; there is
   no half-migrated state to clean up and no cleanup script to run.
6. **Confirm the surface is back to its prior shape:**
   `curl 'http://localhost:3000/items?userId=u1'` — items must no longer
   carry a `folderId` key. Then `npm run smoke` (expect `SMOKE: PASS`).

**Partial rollback is not offered and should not be attempted.** The
`folderId` field, the `listItems` filter, and `folders.js` are one cohesive
change; keeping the field while removing the module would leave a
write-only field with no way to set it. Revert the whole slice.

**Blast radius if the rollback is delayed:** low. With no HTTP routes,
folders are unreachable from outside the process; the only externally
visible effect of the slice is an extra `"folderId": null` key on
`GET /items`, on a loopback-only listener.

**Release Manager owns the final plan** (`RELEASE_GATES.md`); this is the
Architect's input to it.

---

## Risks / open questions

| # | Risk | Disposition |
|---|------|-------------|
| 1 | `setItemFolder` / `clearFolderFromItems` are exported and could be called directly, bypassing folder validation and the audit event. | **Accepted, mitigated by documentation.** ESM offers no package-private visibility and this repo has no build step to enforce one. Both get JSDoc naming `folders.js` as the sole entry point, and both are individually user-scoped, so the worst direct-call outcome is an item pointing at a nonexistent folderId — which reads as unfoldered-but-not-null and is invisible to `listItems(userId)`. Flagged for Security to confirm the trade rather than buried. |
| 2 | Folder-name-in-audit (Decision 4) is a judgement call, not a settled reading of invariant 4. | **Open for Security to confirm.** Proposal: exclude. Reversal cost is one metadata key; nothing structural depends on it. |
| 3 | Hard-deleting folders (Decision 3) is an explicit argument that invariant 1 does not extend to the container. | **Open for Security to confirm.** Not a weakening: no item is destroyed or made unreachable by any code path in this slice. If Security disagrees, adding `deletedAt` to the folder record plus a filter in `listFolders` is a contained change — but it should be a deliberate decision, not a default. |
| 4 | `GET /items` response gains a field with no `server.js` change — an invisible contract change on a shipped endpoint. | **Accepted and documented** (§ Back-compat). Verified against all five consumers. QA asserts it deliberately. |
| 5 | "One folder per item, no nesting" is a PM-owned product simplification asserted rather than researched. | **Not reopened here** — out of the Architect's lane, per the EM. Recorded for Post-Launch as an assumption to validate. Decision 1 keeps it a policy rather than a foreclosing shape. |
| 6 | The EM's constraint named three `listItems(userId)` call sites; the repo has five (two more in `scripts/drill/regressed-server.mjs`). | **No impact** — all five pass one argument and all five keep working. Recorded because the count in `01-scope-review.md` is slightly under, and the drill script is easy to miss when grepping only `src/`. |
| 7 | Folder names are not unique per user, so a user can create two folders called "Recipes". | **Accepted for v1.** Uniqueness is a product decision (PM-owned) and enforcing it would add a scan on every create for no stated requirement. Not a defect; note it for Post-Launch. |

**No escalation raised.** No safety invariant needs weakening, the design
fits the EM's 5-file budget, and every question in `01-scope-review.md`
§ Open questions is answered above rather than deferred.

---

## Hand off

**Next agent:** Backend Architect (Implementation, stage 4). This repo has
no frontend surface; `backend-architect.md` owns `src/services/`.

**Artefacts to produce:** code + targeted tests + one focused commit,
landed via branch + PR (`main` is protected, "Release gates" CI must pass).

**Files, matching the EM's budget exactly (2 new, 3 modified):**

| File | Change |
|------|--------|
| `src/services/folders.js` | **new** — `Folder` `Map`, `createFolder`, `listFolders`, `assignItemToFolder`, `deleteFolder`, `_getFolder`, `_reset` |
| `test/folders.test.js` | **new** — tests 1–18 above |
| `src/services/savedItems.js` | modified — `folderId: null` in `addItem`; `options` param on `listItems`; new `setItemFolder`, `clearFolderFromItems` |
| `test/savedItems.test.js` | modified — **append** tests 19–25; edit nothing existing |
| `scripts/build-check.mjs` | modified — one line: register `../src/services/folders.js` |

**Do not:** add folder HTTP routes; refactor `savedItems.js` beyond the
additive changes above; add a dependency; add a persistence or repository
layer; edit `test/digest.test.js`, `test/summary.test.js`, or
`test/server.test.js`.

**Escalate to the EM** if the design does not fit the file budget or an
existing test needs editing. **Stop and escalate to the Orchestrator** if
any safety invariant appears to need weakening — that is
`HUMAN_APPROVAL_RULES` rule 4 and needs approval before implementation, not
a design workaround.

**Gates this spec closes:**

| Gate | Owner | Status |
|------|-------|--------|
| Adapter boundaries identified | Architect | **PASS** — n/a, stated with reasoning (§ Adapter boundaries) |
| Audit / usage events listed | Architect | **PASS** — three events, metadata specified, every state-changing function has an entry (§ Audit events) |

**Left for Security to verify, not decide:** Decision 3 (hard-deleting
folder records vs invariant 1), Decision 4 (folder names excluded from
audit metadata vs invariant 4), and Risk 1 (exported mechanics).

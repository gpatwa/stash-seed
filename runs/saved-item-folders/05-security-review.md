# Security & Privacy Review — saved-item-folders

> Owner: Security & Privacy Agent
> Status: **GO** — conditional on SEC-1 and SEC-2 (test-only, additive)
> Source diff: `bb8a1135ffb27ec48e1e7a96894ada5233b89a54` (branch `slice/saved-item-folders`)
> Reviewed against: `.agentic/SAFETY_INVARIANTS.md`, `docs/HUMAN_APPROVAL_RULES.md`

Everything below was verified against the real repo code. Where QA or the
Architect asserted something, I re-derived it rather than accepting it —
including two places where I mutated a scratch copy of the source to prove
the test suite actually catches the regression it claims to catch. No file
in `src/` or `test/` was modified by this review (`git status` clean for
both; `HEAD` still `bb8a113`).

---

## Verdict on the three deferred judgement calls

### Decision 3 — folder records are hard-deleted → **AGREE with the reasoning; see SEC-3**

Invariant 1 reads: *"Deletes are soft and recoverable. Deleting sets
`deletedAt`; the record is retained, not removed."*

The Architect's argument survives scrutiny, on four grounds I checked myself:

1. **The invariant is item-scoped by its own mechanism.** It does not say
   "deletes are soft"; it says *"Deleting sets `deletedAt`"*. `deletedAt`
   exists on exactly one entity in this codebase — `SavedItem`
   (`savedItems.js:5`). A folder record has no such field and never had one.
   Invariants 2, 4 and 5 all say "item(s)" explicitly; invariant 3 says
   "single or bulk", which names the two item-delete paths. Read as a set,
   invariants 1–5 are written about the `SavedItem` entity.
2. **No content is destroyed or made unreachable.** I traced `deleteFolder`
   end to end: `clearFolderFromItems` only assigns `item.folderId = null`
   (`savedItems.js:122`) — it never touches `deletedAt`, never calls
   `items.delete()`, never removes a record. `folders.delete(folderId)`
   (`folders.js:75`) is the only hard removal, and it removes a
   `{folderId, userId, name}` triple. Every item survives and stays
   readable via `listItems(userId)`.
3. **The "no restore surface" claim is true.** I grepped the whole tree for
   `restore|undelete|recover|purge` across `src/`, `scripts/`, `test/`.
   The only hits are a rollback-drill string and a test *name*
   (`test/savedItems.test.js:24`). There is genuinely no recovery path for
   anything, so a `deletedAt` on folders would buy zero user-reachable
   recovery while adding a filter to every folder read and an undefined
   question ("are items in a soft-deleted folder still in it?").
4. **`HUMAN_APPROVAL_RULES` rule 2 does not apply, and I checked rather
   than assumed.** Rule 2's list — force-pushing a shared branch, resetting
   a remote ref, dropping a production queue, revoking a credential — is
   about *the agent* acting destructively on infrastructure, not about a
   product shipping a delete feature. Applying it to a user deleting their
   own label would be a misread. Rule 4 is likewise not triggered: nothing
   existing is disabled, no gate removed, no audit event suppressed.

**Where I go further than the Architect.** Two things they did not price:

- Their own claim that *"the effect is fully reconstructible from the audit
  log"* is overstated by their own admission four lines later. The
  unfoldering is reconstructible; the folder's **name is not recoverable
  from anywhere** once Decision 4 keeps it out of the log. Decisions 3 and
  4 are individually defensible and jointly eliminate every recovery path.
  I still accept the pair — a label the user chose to delete is not saved
  content — but the spec should not claim full reconstructibility.
- `folders.js:75` is now **the only hard delete of a user-facing record in
  `src/`** (verified: the only other `.delete(`/`.clear(` calls in `src/`
  are the `_reset` test helpers). This slice sets a precedent, and the
  argument that justifies it lives in a run doc nobody reads at slice N+1.
  That is SEC-3.

### Decision 4 — folder names excluded from audit metadata → **AGREE; the citation holds**

I read `digest.js` and `emailAdapter.js` myself rather than taking the
citation on trust. **It checks out:**

- `recipientHash()` (`digest.js:53-55`) is a real one-way transform, and
  both audit events carry `recipientHash: rHash`, never the raw string
  (`digest.js:93-97`, `digest.js:107-111`).
- The raw `recipient` leaves the function in exactly one place —
  `adapter.send({recipient, ...})` (`digest.js:99-103`) — which is the
  adapter boundary, not a log, and the only adapter in the build throws
  unconditionally (`emailAdapter.js:23-27`).

So the house precedent is real: this repo already declined to put a
user-identifying string that is *not* item content into the audit log.

**One correction to the Architect's framing, which strengthens their case
rather than weakening it.** The precedent's *treatment* was hash-and-record,
not omit — so cited literally it argues for hashing folder names, not
excluding them. The Architect chose omission on a separate argument (small,
guessable name space ⇒ a hash is theatre). I independently agree with that
sub-argument, and it is stronger than stated: see ADV-1. Excluding is
*stricter* than the letter of invariant 4 and stricter than the precedent.
Going stricter needs no approval.

**Confirmed empirically:** with `createFolder("u1","Divorce paperwork")`
followed by assign and delete, the full audit output is ids and counts only
— no `name` key and no name string anywhere.

### Risk 1 — exported unaudited mechanics → **AGREE with QA's conclusion, but their framing is incomplete (ADV-2)**

I did not accept QA's verdict; I traced it with a live probe against the
real, unmodified services. Results:

| Direct call | Result | Meaning |
|---|---|---|
| `setItemFolder("u2", u1Item, u2Folder)` | `false`, item unchanged | Item ownership check holds (`savedItems.js:101`) |
| `setItemFolder("u1", u1Item, u2Folder)` | **`true`, foreign folderId written** | The real bypass: no folder validation |
| `listItems("u2", {folderId: u2Folder})` | `[]` | u2 cannot see u1's item |
| `listFolders("u1")` | `[]` | u1 gains nothing from the foreign id |
| `deleteFolder("u2", u2Folder)` | `true`, u1's item still `fld_1` | Sweep is userId-scoped; ref goes dangling |
| `listItems("u2")` after | `[]` | Dangling ref never surfaces to the other user |
| `clearFolderFromItems("u2", u2Folder)` | `[]`, u1's item untouched | Sweep cannot cross the boundary |

**QA's claim is correct**: the worst outcome of a direct call is a dangling
`folderId` inside the caller's own data, never a cross-user leak. The
reason is structural, and I checked it rather than inferring it: every read
path in the codebase filters on `userId` before anything else —
`listItems` (`savedItems.js:29`), `listFolders` (`folders.js:31`),
`listAuditEvents` (`audit.js:24`) — and `folders.js` exposes no
"list items in folder" function that would read by `folderId` alone.

**What QA missed:** the same probe shows the bypass also produces an
**unaudited mutation of an item record** — `listAuditEvents("u1")` returned
`[]` after u1's item had its `folderId` changed, and the subsequent
`folders.deleted` event truthfully recorded `unfolderedCount: 0` while an
item still pointed at the deleted folder. So the cost of the unaudited
mechanic is a dangling reference *plus* a silent gap in the audit trail,
not a dangling reference alone. Still not a cross-user leak, still
in-process only — recorded as ADV-2, not a finding against the code.

---

## Findings

Severity: **blocker** = unsafe to release · **required-fix** = must land, named owner ·
**advisory** = recorded for the EM, no action required this slice.

### SEC-1 — `clearFolderFromItems`' userId check is an untested invariant-5 enforcement point — **required-fix**

`savedItems.js:121` is the third of three user-scoping enforcement points
(the Architect's §User-scoping row 5, "defence in depth"). **It has no
test.** `test/savedItems.test.js` contains 19 tests, none of which calls
`clearFolderFromItems` at all; `test/folders.test.js` reaches it only
through `deleteFolder`, always single-user.

I mutation-tested it in a scratch copy. Removing the `item.userId ===
userId` clause:

- leaves the full suite **76 pass / 0 fail** — completely undetected;
- makes `deleteFolder("u1", f1)` null the `folderId` on **u2's item
  record**, which is a direct invariant-5 violation ("a user only ever
  affects their own items").

The shipped code has the check and is correct — nothing unsafe ships today.
The defect is that the regression suite gives false assurance on the one
clause most likely to be deleted as redundant, precisely because folder ids
come from a global counter and the clause *looks* unnecessary. QA proved
its probe non-vacuous for the other two enforcement points; this one was
never exercised by anyone.

**Fix:** append one test to `test/savedItems.test.js` asserting
`clearFolderFromItems("u2", folderOfU1)` returns `[]` and leaves u1's item's
`folderId` intact. Additive, edits nothing existing. Owner: Implementation.

### SEC-2 — the "invariant 4" test does not test invariant 4 — **required-fix**

`test/folders.test.js:223` is named `invariant 4 — no content in audit` and
asserts two things: the *item content* string is absent, and no key named
`name` exists. It never asserts that the **folder name string** is absent.

Mutation-tested: changing `createFolder`'s event to
`{ folderId, label: name }` leaks `"Divorce paperwork"` into the append-only
log — and **the invariant-4 test passes**. The leak was caught only
incidentally, by the unrelated deep-equal `audit shape — create` test. That
is the wrong guard for this job: deep-equal shape assertions are *expected*
to be updated whenever a field is legitimately added, so the moment a future
slice adds a metadata key and updates that expectation, the name-leak guard
is silently gone.

Note this is narrower than QA's description — QA's *probe* grepped for both
strings, but the permanent test only grepped for one. The probe is not
committed; the test is what protects the next slice.

**Fix:** add `assert.ok(!serialized.includes("Secret Folder Name"))` inside
the existing loop, mirroring the item-content assertion already there. One
line. Owner: Implementation.

### SEC-3 — the hard-delete boundary is not recorded where the next slice will look — **required-fix (EM / human approval)**

Decision 3 is correct (above), but the reasoning that makes it correct —
*invariant 1 protects records carrying user-authored content, not container
records* — exists only in `runs/saved-item-folders/02-architecture.md`. The
invariant document still reads entity-agnostically, and `src/` now contains
its first hard delete.

The failure mode is not this slice. It is slice N+2 citing "folders are
hard-deleted" as settled precedent for an entity that *does* hold content,
with no written boundary to stop it.

**Fix:** amend `.agentic/SAFETY_INVARIANTS.md` invariant 1 to state the
boundary and its conditions — a container/label record may be hard-deleted
provided (a) no record carrying user-authored content is removed or made
unreachable, and (b) the delete emits an audit event carrying the full set
of affected item ids.

**This is itself a change to a safety control and needs human approval
under `HUMAN_APPROVAL_RULES` rule 4** — Security proposes, the human
approves. Security cannot self-approve an edit to the invariants document,
and did not make one. Owner: EM → Orchestrator → human. **Not a release
blocker**: nothing unsafe ships without it, and the correct behaviour is
already implemented.

### Advisories

| # | Finding | Note |
|---|---------|------|
| ADV-1 | `recipientHash()` (`digest.js:53-55`) is an **unsalted, unkeyed, 12-hex-char truncated SHA-256**. Against a candidate address list it is trivially confirmable — a pseudonym, not a privacy control. | Pre-existing, out of scope. Recorded because it is the precedent Decision 4 cites, and it means that precedent is *weaker as protection than it appears* — which is an independent argument for the Architect's "omit rather than obscure" choice, not against it. |
| ADV-2 | The direct-call bypass yields an **unaudited item mutation**, not just a dangling reference (probe: `listAuditEvents("u1")` empty after u1's item was re-foldered; the later `folders.deleted` recorded `unfolderedCount: 0` while a live pointer remained). | Sharpens QA's "worst case is a dangling reference". In-process only, no cross-user path. No action. |
| ADV-3 | `folders.deleted`'s `unfolderedItemIds` is unbounded by the request — bounded only by the user's total item count, unlike `items.bulk_deleted`, whose id list is bounded by the caller's explicit input. | In-memory seed, no log shipping. Revisit if the audit log ever gets a real sink. |
| ADV-4 | `listFolders` returns **live object references** including `userId`, so an in-process caller can mutate a folder's owner. | Consistent with the pre-existing `listItems`/`_getItem` pattern, so not slice-introduced. Matters only if a future slice adds an HTTP folders route: map to a DTO rather than serialising the record, or `userId` ships to the client. |
| ADV-5 | `listItems(userId, null)` throws `TypeError: Cannot convert undefined or null to object` — the default parameter covers `undefined`, not `null`. | Robustness, not security. `server.js`'s catch-all would render it a 400. |
| ADV-6 | `folders._reset()` zeroes `folderSeq` independently of `savedItems._reset()`, so a test resetting one but not the other reissues `fld_1` against stale item pointers. | Test helpers only; unreachable from `server.js` or any script (verified: nothing outside the two service modules imports them). |

---

## Invariant confirmations

| # | Invariant | Verdict | Evidence I gathered |
|---|-----------|---------|---------------------|
| 1 | Deletes are soft and recoverable | **Hold** (items); container hard-delete accepted, see Decision 3 + SEC-3 | No code path removes or hides an item record. `clearFolderFromItems` writes only `folderId = null` (`savedItems.js:122`). Only hard removal in `src/` is `folders.delete()` (`folders.js:75`), on a `{folderId, userId, name}` record. |
| 2 | Destructive multi-item actions are confirmed | **n/a, and I checked** | `deleteFolder` removes zero items. `bulkDeleteItems` is untouched by the diff. No new broad-filter delete exists. |
| 3 | Every delete is audited | **Hold** | `folders.deleted` fires on every successful `deleteFolder`, after the mutation, with `folderId` + `unfolderedCount` + `unfolderedItemIds`. Rejected calls emit nothing (probe: cross-user `deleteFolder` produced zero events). |
| 4 | No item content in logs | **Hold in the shipped code**; the test guarding it is weak — SEC-2 | All three new `recordAuditEvent` calls (`folders.js:27,56,77`) carry ids and counts only. Verified by dumping real audit output with a deliberately sensitive folder name and item content — neither string appears. |
| 5 | A user only ever affects their own items | **Hold**; one enforcement point untested — SEC-1 | Three checks: `folders.js:47` (folder ownership), `savedItems.js:101` (item ownership), `savedItems.js:121` (sweep scoping). All three verified live via probe. All read paths filter `userId` first (`savedItems.js:29`, `folders.js:31`, `audit.js:24`). |
| 6 | AI/LLM adapters throw by default | **Hold, unaffected** | `emailAdapter.js` and `summary.js` are not in the diff; both still `throw` (`emailAdapter.js:24`, `summary.js:94`). `folders.js` imports only `audit.js` and `savedItems.js` — no adapter, no model, no network. |
| 7 | Server reachable only from its host | **Hold, unaffected** | `src/server.js` is not in the diff; `LISTEN_HOST = "127.0.0.1"` intact at line 115. No folder route added — `folders.js` is referenced outside its own module only by `scripts/build-check.mjs:10`. |

## Standard scans

| Scan | Result |
|------|--------|
| Secrets / credentials / tokens in the diff | **Clean.** Grepped the diff for api keys, secrets, tokens, passwords, bearer, private keys, `aws_`, `sk-`, `ghp_`, `xox*-`, and ≥40-char base64 runs. Only hits are the deliberate test fixture strings `"Secret Folder Name"` / `"secret item content"` in `test/folders.test.js` — assertion inputs, not credentials. |
| PII / user data in logs | **Clean.** Zero `console.*`, `process.stdout`, `process.stderr` or debug statements added anywhere in `src/` by this diff. `server.js`'s bodiless access log is untouched. All new logging is `recordAuditEvent` with ids and counts. |
| Approval-gated action introduced | **None, confirmed not just asserted.** No send/submit/publish/purchase/external-effect path is added. Verified structurally: the diff introduces no `fetch`, no `node:http`/`node:net`/`node:fs`/`node:child_process` import, no `eval`/`Function`, and `folders.js` imports exactly two local modules. `HUMAN_APPROVAL_RULES` rules 1, 3, 5 and 6 are not engaged. Rule 4 is engaged only by SEC-3's proposed doc amendment, which is raised for approval, not taken. |
| Adapter boundary integrity | **n/a confirmed true.** No adapter seam added; the two existing ones are outside the diff and still throw. Nothing in the slice touches an external system. |
| Agentic threats (tool/agent surface, prompt-injection sink) | **None.** No tool definition, no agent surface, no model call, no user-controlled string reaching an interpreter. Folder names are stored and returned, never evaluated, never interpolated into a command, query or prompt. |
| Audit coverage vs. spec | **Exact match.** Spec lists three events; diff emits exactly three, same names, same metadata keys, same emission points, all after the mutation and only on success. The two deliberate exclusions (`setItemFolder`, `clearFolderFromItems`) are documented with stated reasons in the spec's quality-bar table; I confirmed the stated reason is the real one — `setItemFolder` structurally *cannot* validate the folder it writes without a circular import. |

## Independent re-verification

Re-ran the project's own commands against the unmodified repo:
`npm test` → **tests 76, pass 76, fail 0**; `npm run typecheck` →
`typecheck ok`; `npm run build` → `build ok`. Matches QA's numbers exactly.

Mutation testing was performed on a **scratch copy** outside the repo
(`src/`, `test/`, `package.json` copied out, mutated there, discarded).
`git status` confirms `src/` and `test/` are unmodified and `HEAD` is still
`bb8a113`.

---

## Recommendation

- [x] **Go to Release** — conditional on SEC-1 and SEC-2
- [ ] Block

**Go.** I considered blocking on SEC-1 and decided against it, and the
reasoning should be on the record: the shipped code is correct at all three
user-scoping enforcement points, verified by live probe against the real
services, so no user data is at risk in this release. SEC-1 and SEC-2 are
defects in the *test suite's* ability to protect invariants 4 and 5 in
future slices, not in the artefact being released. Both fixes are
test-only, additive, edit nothing existing, and total roughly a dozen
lines — cheap enough that they should land while this slice is open rather
than become a follow-up nobody reopens. **Release should not sign off until
both are appended and the suite is re-run green.**

SEC-3 is routed separately as an approval request to the human under rule 4
and does not gate this release.

On the three deferred judgement calls: the Architect was right on all
three, and QA was right to refuse to decide them. I agree with each — but
on my own evidence, not theirs. Decision 4's cited precedent is real and I
verified it in `digest.js` line by line; Risk 1's "never a cross-user leak"
is true and I proved it by executing the bypass rather than reading about
it; Decision 3 is a sound reading of an item-scoped invariant. What none of
them caught is that two of the guards standing behind those verdicts are
not actually held in place by any test — which is what SEC-1 and SEC-2 are
for.

## Hand off

**Next agent:** Implementation (SEC-1, SEC-2 — two appended tests), then
Release Manager. **EM** owns raising SEC-3 to the human as a rule-4
approval request.

---

# Re-verify — Security round 1

> Re-verified at `b3ec7c154faee955d257bbbbb036dd45c11a7a2d` (branch
> `slice/saved-item-folders`), against the rework described in
> `03-implementation.md` §"Rework — Security round 1".
> **Verdict: both required-fixes CLOSED. Unconditional GO to Release.**

I did not accept the rework report's account of what it fixed. I re-read the
committed diff, then re-ran both live-mutation proofs myself in a fresh
scratch copy (`src/`, `test/`, `scripts/`, `package.json` copied out of the
repo, mutated there, restored, discarded). Every failure message quoted below
is from my own run, not transcribed from the rework doc. The repo itself was
never written to: `git status --short src/ test/` is empty and `HEAD` is
still `b3ec7c1` after all of it.

## Scope check — the rework is test-only, verified structurally

- `git diff bb8a113 b3ec7c1 -- src/` → **empty**. No source change, as
  required.
- `git diff bb8a113 b3ec7c1 -- test/` contains **zero deleted lines** (I
  grepped the diff for `^-`; nothing but the `---` file header). The change
  is strictly additive: +26 lines in `test/savedItems.test.js`, +4 in
  `test/folders.test.js`. Nothing existing was weakened, relaxed, or removed
  under cover of the fix.
- Scratch copy baselines identical to the repo (77 pass / 0 fail) before any
  mutation, so every failure below is attributable to my mutation alone.

## SEC-1 — CLOSED (re-proved, two independent mutations)

New test: `test/savedItems.test.js:306`,
`clearFolderFromItems does not clear another user's item sharing the same folderId`.

**Mutation A — remove the userId clause** (`src/services/savedItems.js:121`,
`if (item.userId === userId && item.folderId === folderId)` →
`if (item.folderId === folderId)`). Full suite under mutation:
**77 tests, 76 pass, 1 fail** — and the one failure is the new test:

```
test at test/savedItems.test.js:306:1
✖ clearFolderFromItems does not clear another user's item sharing the same folderId
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [
      'item_1',
  +   'item_2'
    ]
  actual: [ 'item_1', 'item_2' ], expected: [ 'item_1' ]
```

This is the exact mutation that my original review found left the suite at
**76 pass / 0 fail, completely undetected**. It is now caught, by exactly one
test — the intended one.

**Mutation B — the sneakier variant, which I added and the rework did not
run.** A dropped userId clause is the obvious regression; the dangerous one
is a sweep that clobbers the other user's record while still returning an
honest-looking list, which would defeat a test that only asserted the return
value:

```js
if (item.folderId === folderId) {
  item.folderId = null;                                    // cross-user clobber
  if (item.userId === userId) cleared.push(item.itemId);   // return list still truthful
}
```

Caught, on the state assertion rather than the return-value one:

```
✖ clearFolderFromItems does not clear another user's item sharing the same folderId
  AssertionError [ERR_ASSERTION]: u2's item must remain untouched by a sweep scoped to u1
  null !== 'fld_1'
```

So the test guards the actual invariant-5 property (u2's *record* is
untouched), not merely the function's return value. That is stronger than
what SEC-1 asked for.

**One deviation from my written fix, and it does not matter.** SEC-1
prescribed asserting `clearFolderFromItems("u2", folderOfU1)` returns `[]`;
the implemented test runs the mirror direction (u1 sweeps, u2's item must
survive). Both directions are killed by the same mutation — I confirmed that
by running it — and the implemented direction additionally asserts the
victim's persisted state, which the direction I prescribed would not have.
Accepted as written.

## SEC-2 — CLOSED (re-proved, including a leak path no other test guards)

Tightened test: `test/folders.test.js:223`, `invariant 4 — no content in audit`,
now asserting the folder-name string is absent from serialized metadata.

**Mutation A — leak into `folders.created`** (`src/services/folders.js:27` →
`{ folderId, label: name }`, the renamed-field leak from my original
finding). `node --test test/folders.test.js` → **18 tests, 16 pass, 2 fail**;
the target test now fails on its own assertion:

```
test at test/folders.test.js:223:1
✖ invariant 4 — no content in audit
  AssertionError [ERR_ASSERTION]: folder name string must not appear anywhere in audit metadata
```

**Mutation B — leak into `folders.deleted` instead.** This is the mutation
that actually settles SEC-2, and it is mine, not the rework's. SEC-2's real
complaint was that the leak was caught only *incidentally*, by the
deep-equal `audit shape — create` test — a guard that will be legitimately
updated the first time a metadata key is added. `folders.deleted` has **no
deep-equal guard at all** (`audit shape — delete` asserts three individual
fields, `folders.test.js:216-219`), so a name leaked there has no incidental
catcher whatsoever. Leaking `label: folder.name` into the `folders.deleted`
event:

- **against the pre-rework tests** (`git show bb8a113:test/folders.test.js`
  restored over the scratch copy, mutation still in place):
  **76 tests, 76 pass, 0 fail** — a live user-authored folder name written
  into the append-only audit log, and the suite is entirely green;
- **against the committed tests**: **77 tests, 76 pass, 1 fail**, the single
  failure being the tightened assertion, with the same
  `folder name string must not appear anywhere in audit metadata` message.

That is a clean before/after on a leak path that nothing else in the suite
covers. SEC-2's fix is load-bearing, not decorative.

**Coverage of the assertion is complete, which I checked rather than
assumed.** `recordAuditEvent` (`audit.js:10-20`) fixes `id`, `userId`, `type`
and `at` itself; `metadata` is the only caller-controlled field on an event.
So checking `JSON.stringify(e.metadata)` cannot miss a leak — there is
nowhere else for a caller to put one. The test also loops over *all* of the
user's events, not just the create event, which is why Mutation B was caught.

## Gates re-run by me, on the real repo at `b3ec7c1`

| Command | Result |
|---|---|
| `npm test` | **tests 77, pass 77, fail 0** |
| `npm run typecheck` | `typecheck ok` |
| `npm run build` | `build ok` |
| `npm run qa:mvp` | `typecheck ok`, **77 pass, 0 fail** |

77 = the 76-test baseline plus the one new SEC-1 test; SEC-2 tightened an
existing test, so it adds no count. The delta reconciles exactly.

## Regression / new-finding check

- **No regression.** All 76 pre-existing tests still pass; the diff deletes
  no test line and modifies no existing assertion except by *adding* one
  inside an existing loop.
- **No new finding introduced.** The rework touches only `test/`. The new
  test's only notable act is importing `clearFolderFromItems` — an unaudited
  internal mechanic — into the test file, which is appropriate: it is the
  function under test, and the import is test-scope only. It does not widen
  any production surface.
- **Not fixed, and correctly so:** SEC-3 (invariants-doc amendment, rule-4
  human approval) and ADV-1…ADV-6 are untouched. Both were explicitly out of
  scope for this rework; SEC-3 does not gate release.

## Final recommendation

- [x] **GO to Release — unconditional.** The two conditions I attached to my
      original GO are discharged on my own evidence.
- [ ] Block

Both required-fixes are closed by tests I independently proved non-vacuous:
each one now fails, with a clear message naming the violated property, when
and only when the guard it protects is removed. The release artefact is
unchanged from the code I already cleared — `src/` is byte-identical to
`bb8a113` — so nothing about the shipped behaviour needs re-clearing; what
changed is that invariants 4 and 5 are now actually held in place by the
suite for the next slice, which was the entire point of SEC-1 and SEC-2.

SEC-3 remains routed to EM → Orchestrator → human as a rule-4 approval
request and does **not** gate this release.

**Next agent:** Release Manager.

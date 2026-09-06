# Release Checklist — saved-item-folders

> Stage 7 · Owner: Release Manager Agent
> Tier: **2**
> Source diff: `bb8a1135ffb27ec48e1e7a96894ada5233b89a54` (original) +
> `b3ec7c154faee955d257bbbbb036dd45c11a7a2d` (SEC-1/SEC-2 rework, test-only),
> branch `slice/saved-item-folders`, parent `main` (verified: `git log
> main..HEAD` shows exactly these two commits; no PR opened yet — verified
> via `gh pr list --head slice/saved-item-folders`, empty).
> Source artefacts: `runs/saved-item-folders/00-slice-plan.md`,
> `01-scope-review.md`, `02-architecture.md`, `03-implementation.md`
> (incl. "Rework — Security round 1"), `04-qa-evidence.md`,
> `05-security-review.md` (incl. "Re-verify — Security round 1"),
> `STATE.md`. Gates walked against `docs/RELEASE_GATES.md`; approval
> against `docs/HUMAN_APPROVAL_RULES.md`.

This checklist and the go/no-go decision are this stage's whole output. The
Release Manager wrote no code and did not push, merge, or open a PR — that
action is routed to the human/Orchestrator as a separate, explicit step
after this recommendation (§ Decision).

## Tier classification rationale

**Tier 2 — confirmed independently, not inherited.** Per
`docs/RELEASE_GATES.md`, Tier 2 covers "new UI feature, new service,
internal data model change" with no external effect; Tier 3 requires a
change that "sends, submits, posts, publishes, pushes, deploys, or
destroys," touches a third-party integration, or alters auth/permissions.

I walked the actual diff against the Tier-3 triggers rather than trusting
the label: this slice adds a private in-memory `Folder` entity and a
`folderId` field on `SavedItem` (`src/services/folders.js`,
`src/services/savedItems.js`). No send/submit path, no new adapter, no
network/env/config/`fetch` import (confirmed by Security's structural
grep), no auth or permission change, no third-party processor. The one
externally-observable effect — `GET /items` gains a `"folderId": null` key
— is an additive read-only field on a loopback-only, unauthenticated-by-
design listener (invariant 7 unaffected), not a new external effect.

Three independent stages reached the same tier: Intake (`00-slice-plan.md`
§ Release tier), Scope Review (`01-scope-review.md` § Gate map, "I
independently confirm the Orchestrator's tier call"), and Architecture
(implicitly, by treating the Tier-2 gate list as the target throughout
`02-architecture.md`). I re-confirm it a fourth time here against the
shipped diff, not the plan. **Tier 2 stands.**

## Gates

Every gate from `docs/RELEASE_GATES.md`, walked top to bottom for Tier 2.
Each entry points at the artefact and, where practical, at evidence I
re-derived myself rather than re-reading a prior stage's self-report.

### Scope

- [x] **Slice fits in one implementation pass** — `01-scope-review.md`
  § Size check: 5 files (2 new, 3 modified) against a 10-file cap.
  Confirmed against the actual shipped diff: `git diff --stat main..HEAD`
  shows exactly `src/services/folders.js` (new), `test/folders.test.js`
  (new), `src/services/savedItems.js`, `test/savedItems.test.js`,
  `scripts/build-check.mjs` modified — the same five files, no more. One
  implementation pass, confirmed shipped as such (`03-implementation.md`,
  `04-qa-evidence.md`).
- [x] **Non-goals are explicit** — `00-slice-plan.md` § Non-goals and
  `01-scope-review.md` § Scope correction / § Out of scope reminder
  (nested folders, multi-folder membership, sharing/RBAC, no UI, no bulk
  folder ops, no HTTP endpoints, no persistence). All confirmed still true
  of the shipped diff — no HTTP route added, no persistence layer added
  (verified: `src/server.js` not in the diff).

### Discovery

- [x] **Success criteria are observable** — `00-slice-plan.md` § Success
  criteria and `01-scope-review.md` § Success criteria (measurable,
  tightened to 7 items), each mapped to named tests in
  `02-architecture.md` § Test plan and shown green in `03-implementation.md`
  / `04-qa-evidence.md`. No PRD exists because Discovery/PM was compressed
  at Scope Review (well-understood internal extension, no fuzzy product
  question) — the gate's actual requirement (assertable success criteria)
  is satisfied by the slice plan + scope review in the PRD's place, the
  same compression pattern used in this repo's `email-digest` precedent.

### Architecture

- [x] **Adapter boundaries identified** — `02-architecture.md` § Adapter
  boundaries: "None. n/a for this slice" with an explicit argument (no
  external system, no I/O, no non-determinism; the two existing adapter
  seams exist for capabilities that cannot be done in-process, neither
  condition applies here). I agree with the reasoning independently — this
  slice's diff contains no adapter-shaped seam of any kind.
- [x] **Audit / feedback / usage events listed** — `02-architecture.md`
  § Audit / feedback / usage events: three events (`folders.created`,
  `items.folder_assigned`, `folders.deleted`), metadata specified field by
  field, every state-changing function mapped to an audit decision
  (including the two deliberately-unaudited mechanics, with reasons).
  Verified against the shipped code directly (not just the spec): read
  `src/services/folders.js` lines 17–79 myself — all three
  `recordAuditEvent` calls match the spec's event names and metadata keys
  exactly (`{folderId}`, `{itemId, folderId}`,
  `{folderId, unfolderedCount, unfolderedItemIds}`).

### Implementation

- [x] **Typecheck passed** — re-ran myself: `npm run typecheck` →
  `typecheck ok`, on the current `HEAD` (`b3ec7c1`), matching
  `03-implementation.md` and `04-qa-evidence.md`.
- [x] **Targeted tests passed** — `03-implementation.md` /
  `04-qa-evidence.md`: `node --test test/folders.test.js` → 18/18 (pre-SEC
  fix) / 18/18 (post, unaffected in count); `node --test
  test/savedItems.test.js` → 19/19 pre-fix, 20/20 post-fix (SEC-1 added
  one test). Consistent with the diff (`+114` lines in
  `test/savedItems.test.js` including the new SEC-1 case at line ~305).
- [x] **Full test suite passed** — re-ran myself on `HEAD` (`b3ec7c1`):
  `npm test` → **tests 77, pass 77, fail 0**. Matches QA's independent
  run (`04-qa-evidence.md`, on the pre-rework commit, 76/76) plus
  Security's re-verify (`05-security-review.md` re-verify section, 77/77
  on `b3ec7c1`) exactly. 77 = 76 baseline (15 digest + 18 folders + 19
  savedItems + 9 server + 15 summary) + 1 new SEC-1 test; SEC-2 tightened
  an existing test with no count change — the arithmetic reconciles.
- [x] **Build passed** — re-ran myself: `npm run build` → `build ok`.
  Confirmed `folders.js` is registered in `scripts/build-check.mjs`'s
  `modules` array (the diff shows the one-line addition) and imports
  cleanly.
- [x] **One commit per task** — two commits on the branch
  (`git log main..HEAD`): `bb8a113` (the slice) and `b3ec7c1` (the SEC-1/
  SEC-2 rework, its own distinct task per Security's required-fix
  hand-off). Each is one focused, self-contained commit; no
  work-in-progress or fixup commits on the branch.
- [x] **No new lint warnings** (`git diff --check`) — `04-qa-evidence.md`
  step 6: `git diff --check bb8a113~1 bb8a113` → exit 0, no output. No
  equivalent lint tool beyond whitespace-check exists in this
  dependency-free repo (`package.json` has no lint script); this is the
  gate's full scope here, per `RELEASE_GATES.md`'s "(or pack equivalent)."

### QA

- [~] **UI verified in preview where observable** — **n/a.** This repo is
  headless: no view layer anywhere in `src/` (`04-qa-evidence.md` § UI
  verification, confirmed independently — `src/server.js` is a plain JSON
  API, no templates/HTML). Nothing to preview.
- [x] **Local regression command passed** — re-ran myself: `npm run
  qa:mvp` → `typecheck ok`, **tests 77, pass 77, fail 0**. Matches
  `04-qa-evidence.md` step 5 and Security's re-verify gate table exactly.
- [x] **Safety invariants verified** — `04-qa-evidence.md` § Safety
  invariant verification, table for invariants 1/3/4/5/7 (2 and 6 n/a,
  untouched). I spot-checked rather than took it at face value:
  - **Invariant 5** (the primary risk this slice introduces): QA's own
    account documents an independent, non-vacuous probe (mutation-tested
    against two injected regressions, both caught). Security went further
    and found a real gap in that same invariant's *test* coverage (SEC-1 —
    `clearFolderFromItems`'s userId clause, correct in the shipped code
    but zero-tested) that QA's probe did not surface because QA's probe
    exercised `deleteFolder`/`assignItemToFolder`, never
    `clearFolderFromItems` directly with a folderId collision. I verified
    the fix myself: read `src/services/savedItems.js:121` —
    `if (item.userId === userId && item.folderId === folderId)` — and
    `test/savedItems.test.js`'s new case (lines ~305–320), which
    constructs the exact collision scenario and asserts u2's item survives
    a sweep scoped to u1. This is the invariant table's actual proof, not
    a citation of one.
  - **Invariant 4**: same pattern — QA confirmed the *implementation*
    carried no name/content leak (independent probe, JSON-stringify +
    grep); Security found the *permanent test* didn't assert the specific
    thing its name claimed (SEC-2). I read the fixed test myself
    (`test/folders.test.js:234–238`) — it now asserts
    `!serialized.includes("Secret Folder Name")` inside the loop, not just
    the pre-existing item-content and no-`name`-key assertions. Confirmed
    live: `grep -n "Secret Folder Name" -A15 test/folders.test.js`.
  - Both gaps were in test coverage, not shipped behaviour — the
    underlying code was correct in the original diff, verified by Security
    via live mutation both before and after the fix, and I re-derived the
    same conclusion by reading the code and the tests directly rather than
    accepting either report's word.

### Security

- [x] **No secrets / credentials in diff** — `05-security-review.md`
  § Standard scans: clean; only hits are deliberate test fixture strings
  (`"Secret Folder Name"`, `"secret item content"`), not credentials.
- [x] **No PII / sensitive data logged** — `05-security-review.md`:
  zero `console.*`/`process.stdout`/`process.stderr` added; all new
  logging is `recordAuditEvent` with ids and counts only, confirmed by my
  own read of `folders.js`'s three `recordAuditEvent` calls above.
- [x] **Audit events cover state changes** — `05-security-review.md`
  § Standard scans "Audit coverage vs. spec": exact match, three events,
  same names/metadata/emission points as the tech spec; the two
  deliberately-unaudited mechanics are documented with the real
  structural reason (`setItemFolder` cannot validate the folder it writes
  without creating the circular import Decision 1 exists to prevent).
- [x] **Adapter boundary placeholder still throws** — `05-security-review.md`
  Invariant 6 row: `emailAdapter.js` and `summary.js` are not in this
  diff; both still throw. `folders.js` imports only `audit.js` and
  `savedItems.js` — no adapter, no model, no network. Regression-only
  check, unaffected by this slice, as expected for a Tier-2 data-model
  change.

**Both Security required-fixes (SEC-1, SEC-2) are CLOSED**, not merely
opened-and-noted. Security's own re-verify section
(`05-security-review.md`, "Re-verify — Security round 1") independently
re-derived both fixes via fresh live-mutation proofs (including a second,
sneakier mutation for each that the original rework didn't run) and issued
an **unconditional GO** at `b3ec7c1`. I re-confirmed the committed test
code directly above rather than relying on that verdict alone. **SEC-3**
(amend `.agentic/SAFETY_INVARIANTS.md` to state the hard-delete-container
boundary) is explicitly **not a release blocker** per Security's own
disposition — "nothing unsafe ships without it, and the correct behaviour
is already implemented" — and is routed EM → Orchestrator → human as a
rule-4 approval request, tracked below rather than gating this release.

### Release

- [x] **Human approval points satisfied** — see § Human approval below
  (no rule from `docs/HUMAN_APPROVAL_RULES.md` is tripped by what ships
  in this diff; SEC-3 is a separate, non-blocking, already-routed rule-4
  item).
- [x] **Rollback plan exists** — `02-architecture.md` § Rollback plan,
  quoted and confirmed against the actual diff below.
- [x] **Release checklist filled** — this artefact.

### Enterprise & governance gates

**All n/a — no overlay roles enabled for this slice.** Project pack is
`b2c-saas` (`STATE.md`), no enterprise overlay instantiated. The
Architecture stage already closed the one enterprise gate that could have
applied and would otherwise be easy to skip silently — "Schema / data
migration has a plan + rollback" — marked n/a **for the substantive
reason**, not by omission: the store is a process-lifetime in-memory
`Map`, so there is no schema and no persisted data to migrate
(`02-architecture.md` § Data model deltas, "Back-compat statement";
confirmed independently — this repo has no database, no migration
tooling, no `.sql`/`.prisma`/`knex` anywhere in the tree).

### Skipped / n/a gates

| Gate | Reason | Marked by |
|------|--------|-----------|
| QA — UI verified in preview | Headless repo, no view layer in `src/` anywhere. Nothing to preview. | Release Manager (confirmed, `04-qa-evidence.md`) |
| Enterprise & governance gates (all) | No overlay roles enabled; `b2c-saas` pack, no enterprise overlay in this run. | Release Manager |
| (Compressed stage, not a release gate) Market Research; Discovery/PM | Skipped at Intake / Scope Review: well-understood internal extension, no fuzzy product question, observable-success-criteria requirement met via slice plan + scope review instead. | EM (recorded), Release Manager (confirmed) |

No skipped gate lacks a reason. No **failed** gate. Failure budget per
`STATE.md`: 1/2 used at Security Review (required-fix, resolved same
cycle — not a broken build, a suite-coverage gap caught and closed before
Release).

## Human approval

Walked all six `docs/HUMAN_APPROVAL_RULES.md` rules against the **shipped
diff**, independently of the three prior "none tripped" calls at Intake
(`00-slice-plan.md`), Scope Review (`01-scope-review.md`), and
Architecture (implicit, no escalation raised in `02-architecture.md`
§ Risks). Security's own "Approval-gated action introduced" scan
(`05-security-review.md` § Standard scans) reached the same conclusion
structurally — I re-derive it here rather than cite it as settled:

1. **Send/submit on behalf of a user** — not tripped. No send/submit/
   publish/post path exists anywhere in this diff.
2. **Destructive operations on shared state** — not tripped. `deleteFolder`
   destroys a folder *label* the acting user owns, never another user's
   record, never a database/branch/queue/credential. This is a product
   feature operating on the user's own data via the normal safety-invariant
   path (audited, user-scoped), not the class of infrastructure-destructive
   action rule 2 targets — confirmed against rule 2's own example list
   (force-push, remote-ref reset, dropping a production queue, revoking a
   credential): none apply.
3. **External-effect change via deploy/release** — not tripped by the
   slice's content itself. The standard release-stage approval this rule
   names is the human's own act of merging — that is exactly what this
   checklist routes to the human as a separate step (§ Decision), not an
   approval this run needs to request mid-slice.
4. **Changes to safety controls** — **not tripped by what ships.** No gate
   is skipped, no audit event disabled, no approval gate removed, no
   `--no-verify`. **SEC-3 is the one item that would trip this rule** — it
   proposes *amending* `.agentic/SAFETY_INVARIANTS.md` to document the
   hard-delete-container boundary — and it is correctly **not included in
   this diff**. It is routed as its own, separate rule-4 approval request
   (EM → Orchestrator → human), tracked as a follow-up, and does not gate
   this release per Security's explicit disposition.
5. **Inviting an LLM into a deterministic path** — not tripped. No adapter
   touched, no model wired, `folders.js` imports only `audit.js` and
   `savedItems.js`.
6. **New third-party data processor** — not tripped. Purely internal data
   model change, no new integration.

**Result: no rule 1–6 approval is required to ship this diff.** SEC-3 is
recorded as a distinct, already-routed, non-blocking rule-4 item — restated
here so Release does not silently absorb it as "handled."

### The one approval that *is* required, and who owns it

Per `docs/HUMAN_APPROVAL_RULES.md` rule 3 and this repo's own precedent
(`runs/email-digest/06-release-checklist.md` § Decision), **landing this
branch is itself a human action, not a release-gate approval this stage
requests.** `main` has live branch protection (verified directly via
GitHub API, not this repo's docs — see below): a PR is required, and the
merge cannot happen without one. This Release Manager stage does not open
that PR, does not push, and does not merge. That is the Orchestrator's /
human's explicit next step, separate from this gate sign-off.

## Branch-protection reality (T4) — verified live, not from local docs

Checked directly against the real GitHub repository, not this run's
artefacts:

```
$ gh api repos/gpatwa/stash-seed/branches/main/protection
required_status_checks: { strict: true, contexts: ["Release gates"] }
required_pull_request_reviews: { required_approving_review_count: 0, ... }
enforce_admins: { enabled: true }
allow_force_pushes: { enabled: false }
```

- `main` requires a pull request (the protection's
  `required_pull_request_reviews` block exists, meaning direct pushes are
  blocked even though 0 reviewer approvals are mandated) **and** the
  `"Release gates"` status check — the CI workflow at
  `.github/workflows/ci.yml`, which runs typecheck → test → build →
  qa:mvp → rollback:drill as one job named "Release gates" — must pass
  before merge, with `strict: true` (the PR branch must be up to date with
  `main`). `enforce_admins: true` — this applies even to a repo-admin
  push. `git log main..HEAD` on this branch confirms two commits ahead,
  no PR yet exists (`gh pr list --head slice/saved-item-folders` returns
  empty).

**This is the critical caveat for this release: the local gate evidence in
this run's artefacts (`03-implementation.md`, `04-qa-evidence.md`,
`05-security-review.md`, and my own re-runs above — all showing 77/77,
typecheck ok, build ok, qa:mvp green) is NOT the same thing as the
"Release gates" CI check actually passing on a real PR.** That check only
executes once a PR is opened against `main` on GitHub and the workflow
runs there. Every gate above has been verified **locally, independently,
by three separate agents (Implementation, QA, Security) plus this stage**
— but none of that constitutes the CI-enforced gate itself. **Local
evidence complete; CI-enforced gate confirmation pending an actual PR.**
This is not a gap in this run's diligence; it is what the tier-appropriate
process actually requires at this exact boundary — the CI check is the
wall `RELEASE_GATES.md` describes ("this is what turns a gate from
convention into a wall"), and a wall can only be tested by actually
approaching it.

## Rollback plan

Quoted from `02-architecture.md` § Rollback plan (Architect's input to
this stage's plan), confirmed against the actual shipped diff
(`git diff --stat main..HEAD`, above — 5 shipped-code files, matching the
spec's description exactly):

> **Preconditions to know before starting:** the store is a
> process-lifetime in-memory `Map`. Nothing is persisted, so there is no
> data to roll back and no migration to reverse. Rolling back the code
> rolls back everything. No user data can be lost by this rollback, and
> no user data survives a restart either way.
>
> 1. Identify the merge commit. `git log --oneline -- src/services/folders.js`
>    — the slice lands as a branch + PR onto `main` (branch protection is
>    live; there is no direct push to find).
> 2. Revert it. `git revert -m 1 <merge-sha>` for a merge commit, or
>    `git revert <sha>` if it landed as a squash. This removes
>    `src/services/folders.js` and `test/folders.test.js`, restores
>    `listItems` to its one-parameter form, drops `folderId` from
>    `addItem`, removes `setItemFolder` / `clearFolderFromItems`, and
>    un-registers `folders.js` from `scripts/build-check.mjs`.
> 3. Verify locally before pushing: `npm run qa:mvp && npm run build`.
>    Expected: `typecheck ok`, full suite green, `build ok`.
> 4. Land the revert the same way the slice landed: branch + PR, with the
>    "Release gates" CI check passing. `main` is protected — a revert
>    cannot be force-pushed.
> 5. Restart any running process. `npm start`. Because the store is
>    in-memory, the restart clears all items and folders regardless.
> 6. Confirm the surface is back to its prior shape:
>    `curl 'http://localhost:3000/items?userId=u1'` — items must no
>    longer carry a `folderId` key. Then `npm run smoke` (expect
>    `SMOKE: PASS`).
>
> **Partial rollback is not offered and should not be attempted.** Revert
> the whole slice.
>
> **Blast radius if the rollback is delayed:** low. With no HTTP routes,
> folders are unreachable from outside the process; the only externally
> visible effect of the slice is an extra `"folderId": null` key on
> `GET /items`, on a loopback-only listener.

**Confirmed concrete and executable from this document alone** — it names
exact files, exact commands, and an exact verification step, and I checked
the file list against the real diff rather than the spec's description of
it. One correction I make to the spec's own wording: it says the two new
test cases will be removed by the revert along with `folders.js` — that
still holds after the SEC-1/SEC-2 rework, since `git revert <sha>` for
**both** commits (`bb8a113` and `b3ec7c1`) removes the SEC-1/SEC-2 test
additions along with everything else; a revert of only `bb8a113` without
also reverting `b3ec7c1` would fail to apply cleanly (the rework commit
modifies lines the first commit introduced). **Updated step 1 for the
Release Manager who executes this later: revert both commits, in reverse
chronological order (`b3ec7c1` then `bb8a113`), not one.**

## Decision

- [x] **GO** — every gate above passes or is n/a with a recorded reason;
  no unapproved human-approval-gated action ships; both Security
  required-fixes are closed and independently re-verified; rollback is
  concrete and executable.
- [ ] No-go.

**What GO authorizes — and what it does not.** This GO **recommends** that
the human open a pull request for branch `slice/saved-item-folders` against
`main` and, once the "Release gates" CI check passes on that PR, merge it.
It does **not** open the PR, push, merge, or deploy anything — this stage
produced a checklist and a decision only, per this role's tool boundary.
**The explicit caveat stands: this GO is based on complete local evidence
(independently re-verified by three separate agents plus this stage's own
re-runs — 77/77 tests, typecheck ok, build ok, qa:mvp green, both SEC
fixes confirmed in the committed code), not on a green "Release gates" CI
run on an actual PR, because no PR exists yet.** The human/Orchestrator's
next action — opening the PR — is precisely what will produce that
missing, final confirmation; until then, "GO" means "ready to open a PR,"
not "already confirmed by the wall that matters."

**SEC-3 is not resolved by this GO.** It remains a separate, outstanding
rule-4 approval request (amend `.agentic/SAFETY_INVARIANTS.md` invariant 1
to state the container/label hard-delete boundary), owned by EM →
Orchestrator → human, tracked independently of this slice's landing.

## Hand off

- **Immediate next step (human/Orchestrator, explicit approval required):**
  open the PR for `slice/saved-item-folders` → `main`, confirm the
  "Release gates" CI check goes green, then merge. This Release Manager
  stage does not perform this step.
- **On merge:** hand off to the Post-Launch Learning Agent to watch the
  one PM-owned assumption flagged in `01-scope-review.md`
  ("one folder per item, no nesting" — asserted, not researched) and the
  follow-up slice already filed ("expose folders over the HTTP API").
- **Separately, not gating this release:** SEC-3's rule-4 approval request
  needs to be raised to the human by EM/Orchestrator.

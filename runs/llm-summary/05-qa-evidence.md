# QA Evidence — llm-summary

> Owner: QA Evidence Agent
> Status: ready for security
> Source diff: `9c96bdd85b4721af2e2f0bfdc9a928ac530aa300` ("Implement
> item-summary composer, LLM adapter boundary, and orchestration"), branch
> `slice/llm-summary`, parent `f10b382`.

## Commands run

In order, independently re-run from repo root
(`/Users/gopalpatwa/opt/stash-seed`), each invoked **separately** (not
chained with `&&`) so no failure could hide behind another. Node `v25.6.0`.

| # | Step | Project command | Result | Notes / tail |
|---|------|-----------------|--------|-------|
| 1 | Typecheck | `npm run typecheck` | pass | `typecheck ok` |
| 2 | Targeted tests | `node --test test/summary.test.js` | pass | `tests 14 / pass 14 / fail 0` |
| 3 | Full test suite | `npm test` | pass | `tests 49 / pass 49 / fail 0 / cancelled 0 / skipped 0 / todo 0` |
| 4 | Build | `npm run build` | pass | `build ok` (import-check now includes `summary.js`) |
| 5 | Local regression (QA gate) | `npm run qa:mvp` | pass | `typecheck ok` then `tests 49 / pass 49 / fail 0` |
| 6 | Whitespace / diff check | `git diff --check` (working tree) and `git show 9c96bdd --check` | pass | both exit `0`, no output — no trailing-whitespace/conflict-marker issues |

Full `npm test` tail (all 49 tests, run independently of the engineer's
session):

```
ℹ tests 49
ℹ suites 0
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 181.064583
```

All 35 pre-existing tests (`savedItems.test.js`, `digest.test.js`,
`server.test.js`) pass unmodified, plus 14 new tests in
`test/summary.test.js` — matches the impl notes' claimed "35 before → 49
after" exactly, independently reproduced (not just re-read from the impl
notes).

## Diff check — additive-only claim verification

Claim to verify (impl notes): "2 new files, 1 modified [by 1 line]; no
existing service modified."

```
$ git show --name-status 9c96bdd
A   runs/llm-summary/02-impl-notes.md
M   runs/llm-summary/STATE.md
M   scripts/build-check.mjs
A   src/services/summary.js
A   test/summary.test.js
```

- Under `src/` and `test/`: exactly **2 files, both Added (A), 0
  Modified** — `src/services/summary.js`, `test/summary.test.js`.
  `src/services/savedItems.js` and `src/services/audit.js` do not appear
  in the diff at all — confirmed **not** modified.
- `scripts/build-check.mjs` diff is exactly **+1 line**
  (`"../src/services/summary.js",` inserted into the `modules` array,
  nothing else touched) — verified via `git show 9c96bdd --
  scripts/build-check.mjs`.
- The remaining two changed files (`runs/llm-summary/02-impl-notes.md`,
  `runs/llm-summary/STATE.md`) are pipeline run-artefacts, not source or
  test files.
- `package.json` / `package-lock.json` diff for this commit is empty — no
  new dependency added (`git show 9c96bdd -- package.json
  package-lock.json` produces no output).
- `grep -rn "Summarizer" src/` — every match is the typedef name, class
  definitions/docs, or the throw message; the **only** adapter ever
  constructed under `src/` is `new DeterministicSummarizer()` as
  `summarizeItems`'s default parameter (`src/services/summary.js:127`).
  `PlaceholderLlmSummarizer` is exported but never auto-constructed
  anywhere in `src/` — independently reproduced, matches the impl notes'
  boundary-integrity claim exactly.
- `grep -n "console\.\|process\.env" src/services/summary.js` — no
  matches. No logging, no env reads in the new module.

**Verdict: additive-only claim confirmed exactly.**

## Runtime probe (independent, not the unit tests)

Wrote a throwaway probe at `runs/llm-summary/probe.mjs` that imports the
real modules directly (`../../src/services/savedItems.js`,
`../../src/services/audit.js`, `../../src/services/summary.js`,
`../../src/server.js`) and drives them with its own hand-written checks —
independent of `test/summary.test.js`. Ran with `node
runs/llm-summary/probe.mjs`, then **deleted** the file immediately after
capturing output below (confirmed gone; `git status --porcelain` shows a
clean tree, no trace — it was never staged or committed).

Verbatim output:

```
=== (a) No invention ===
[PASS] a1: itemCount === N (true live count, never fabricated) — itemCount=3 N=3
[PASS] a2: itemCount matches listItems ground truth exactly
[PASS] a3: snippet is a substring of the true most-recent live item's content — snippet="payload containing PROBE-SECRET-XYZ marker"
[PASS] a4: snippet (if any) is a substring of SOME real live item (general no-invention check)
[PASS] a5: deleting an item drops it from the count (N -> N-1) — post-delete itemCount=2, expected 2
[PASS] a6: deleted item's secret content no longer appears in text or snippet

=== (b) User-scoping ===
[PASS] b1: u1 summary itemCount reflects only u1's items — u1 itemCount=1
[PASS] b2: u2's content never appears in u1's summary text/snippet
[PASS] b3: u2 summary itemCount reflects only u2's items — u2 itemCount=2
[PASS] b4: u1's content never appears in u2's summary (reverse direction)

=== (c) Content-not-logged / audit ===
[PASS] c1: items.summarized audit event exists
[PASS] c2: audit event carries generationMode — generationMode=deterministic
[PASS] c3: audit event carries itemCount — itemCount=1
[PASS] c4: metadata has no content/text/snippet keys
[PASS] c5: PROBE-SECRET-XYZ absent from JSON.stringify of ALL audit events for this user — not present

=== (d) Placeholder throws / differential ===
[PASS] d1: PlaceholderLlmSummarizer throws via summarizeItems — LLM summarizer is not configured in this build (PlaceholderLlmSummarizer).
[PASS] d2: no items.summarized audit event recorded when placeholder throws — count=0
[PASS] d3: default deterministic adapter succeeds (the differential — only the adapter varies) — generationMode=deterministic itemCount=1

=== (e) Regression sanity: bulk-delete + digest-503 ===
POST /items 201 1ms
POST /items/bulk-delete 200 0ms
[PASS] e1: bulk-delete over HTTP succeeds and reports the deleted id — status=200 body={"deleted":["item_1"],"skipped":[]}
POST /items 201 1ms
POST /digest 503 0ms
[PASS] e2: digest endpoint still returns 503 (email placeholder still throws) — status=503
[PASS] e3: digest 503 body leaks no adapter internals — {"error":"email sending is not configured"}

=== PROBE SUMMARY ===
21/21 checks passed
ALL PROBE CHECKS PASSED
```

Exit code: `0`.

### Probe result summary (a–e)

| Check | What it independently proved | Result |
|---|---|---|
| a | Seeded u1 with 3 items, one containing a distinctive marker (`PROBE-SECRET-XYZ`). `summarizeItems("u1")` returned `itemCount === 3` (`=== listItems("u1").length`, ground truth) — **never a fabricated count**. The returned `snippet` is a true substring of the real most-recent live item's content (checked both against the specific most-recent item and generally against any live item). Soft-deleting the marker item and re-calling dropped `itemCount` to exactly `N-1` (2), and the deleted item's content no longer appeared in `text` or `snippet`. | PASS |
| b | Seeded u1 with 1 item and u2 with 2 items (distinctive markers `BETA-SECRET`/`GAMMA-SECRET`). u1's summary `itemCount` was exactly 1, and neither of u2's marker strings appeared anywhere in u1's `text` or `snippet`. Checked bidirectionally: u1's marker (`ALPHA-MARK`) did not appear in u2's summary either, and u2's `itemCount` was exactly 2 (u1's item not counted). | PASS |
| c | Seeded an item containing `PROBE-SECRET-XYZ`, called `summarizeItems`, then read the `items.summarized` audit event directly via `listAuditEvents("u1")`. Event exists; `metadata.generationMode === "deterministic"`; `metadata.itemCount === 1`; metadata has no `content`/`text`/`snippet` keys; and `JSON.stringify()` of **all** audit events for the user does not contain the marker string anywhere — not just in named fields. | PASS |
| d | `summarizeItems("u1", new PlaceholderLlmSummarizer())` threw the expected message (`"LLM summarizer is not configured in this build (PlaceholderLlmSummarizer)."`) and recorded **zero** `items.summarized` events (a failed summary is never audited as a successful one). Immediately after, `summarizeItems("u1")` with **no second argument** (the default adapter) succeeded with `generationMode: "deterministic"` — the only variable between the throwing call and the succeeding call is which adapter was passed, isolating the placeholder as the sole cause of the differential (not two orchestration branches that happen to agree). | PASS |
| e | Regression sanity over HTTP (`createStashServer`, not the summary code path): added an item, bulk-deleted it via `POST /items/bulk-delete` → `200` with the id in `deleted`; added another item and called `POST /digest` → still `503` (`PlaceholderEmailAdapter` still throws, unaffected by this slice) with a clean error body (`{"error":"email sending is not configured"}`, no adapter-internals leak). Confirms this slice introduced no regression in unrelated existing behaviour. | PASS |

## Safety invariant verification

`.agentic/SAFETY_INVARIANTS.md` defines **five** invariants, numbered 1–5
(confirmed by re-reading the file directly, and cross-checked against
`RUN_PLAN.md:40,50`, which both refer to "safety invariants 1–5"). **There
is no invariant 7** — the verification brief for this stage named
"invariants 4, 5, 7," but invariant 7 does not exist in this project. I am
flagging this rather than fabricating a citation for a non-existent
invariant, which would itself be a no-invention violation — notable given
that's the exact property this slice's evals are designed to catch.
Proceeding with what actually applies:

| Invariant (`.agentic/SAFETY_INVARIANTS.md`) | Applies to this slice? | Verification | Result |
|---|---|---|---|
| 1. Deletes are soft and recoverable | No — `summarizeItems` performs no delete. `grep -n "delete\|Delete" src/services/summary.js` matches nothing (confirmed). Regression re-confirmed via probe (e): `bulkDeleteItems` still sets `deletedAt` and retains the record; unmodified `savedItems.test.js` (12/12 within the 49) still green. | n/a (not touched) | pass (unaffected) |
| 2. Destructive multi-item actions are confirmed | No — this slice adds no multi-item action of any kind (read-only summarization). | n/a (not touched) | pass (unaffected) |
| 3. Every delete is audited | No — this slice records `items.summarized` (a read/compose event), never a delete. Existing delete-audit behaviour unmodified and re-confirmed by probe (e) (`items/bulk-delete` still returns `200` with a `deleted` list). | n/a (not touched) | pass (unaffected) |
| **4. No item content in logs** | **Yes.** | `recordAuditEvent` call in `summarizeItems` passes only `{itemCount, generationMode}` (`src/services/summary.js:137-140`) — no `content`/`text`/`snippet` key. Independently verified at runtime by probe (c): the audit event has no content-shaped keys, and `JSON.stringify()` of every audit event for the user does not contain a seeded distinctive marker string anywhere. Also matches `test/summary.test.js` EVAL 5 (lines 182-200). No `console.*`/`process.env` calls exist in `summary.js` (grep-confirmed above), so there is no secondary logging path either. | **pass** |
| **5. A user only ever affects their own items** | **Yes** (read-scoping; this slice has no write/delete path, so the "rejected, never deleted" half of the invariant's text doesn't apply — only the scoping half does). | `summarizeItems` calls `listItems(userId)` (`src/services/summary.js:132`, reused unmodified, already user-scoped) and audits under the same `userId` — no cross-user read path exists in the new code (`grep -n "userId" src/services/summary.js` shows `userId` used only in the guard, the `listItems` call, and the audit call). Independently verified at runtime by probe (b), bidirectionally: u1's summary never contains u2's marker content and vice versa, and each side's `itemCount` reflects only that user's own live items. | **pass** |
| 7. *(does not exist)* | — | `.agentic/SAFETY_INVARIANTS.md` defines only invariants 1–5; there is no invariant 6 or 7 in this project. No file elsewhere in either repo (`stash-seed`, `agentic-sdlc-playbook`) defines an invariant 7 for this project. Flagged for the record; not verified because there is nothing to verify. | **n/a — flag, not a fail** |

**No-invention (named separately in the brief; not itself a numbered
invariant, but the AI-risk assessment's central concern for this
capability):** verified structurally and at runtime. `itemCount` in both
the return value and the audit event is always `items.length` from
`listItems()`'s real output, never read from the adapter's return value
(`src/services/summary.js:132-134` — read the ~10-line body of
`summarizeItems`: there is exactly one code path, and the adapter's
`summarize()` call is the sole source of any behavioural difference, not
two branches that happen to agree). Probe (a) independently confirms this
at runtime across three scenarios (seed 3, delete 1, re-check), not just
by reading the source. Matches `test/summary.test.js` EVAL 1/EVAL 2.

## UI verification

Not applicable. This slice is backend-only: `summarizeItems` /
`DeterministicSummarizer` / `PlaceholderLlmSummarizer` are new exports
with no route, no UI, no cron — nothing invokes them automatically or
exposes them over HTTP in this build (confirmed: `grep -n "summar" 
src/server.js` returns no matches — `summarizeItems` is not wired to any
endpoint). No UX spec states exist to screenshot or snapshot. Diff is
limited to `src/services/summary.js` and `test/summary.test.js` (plus the
1-line build-check registration and run artefacts).

Console errors / warnings observed: none (no `console.*` calls added —
confirmed by inspection and grep above; no warnings emitted by any of the
6 command runs).

## Deferred / skipped

| Item | Why deferred | Owner |
|------|--------------|-------|
| Invariant "7" named in this stage's verification brief | Does not exist in `.agentic/SAFETY_INVARIANTS.md` (only 1–5 defined). Flagged above rather than silently dropped or fabricated. | Orchestrator — confirm whether this was a drafting error or whether a 6th/7th invariant was intended to be added and never landed |
| Future-model invention guard for free-text `snippet`/`text` (AI-risk finding) | Correctly out of scope for this slice — the LLM path is structurally unreachable (`PlaceholderLlmSummarizer` throws before producing output), so there is nothing generative to guard yet. Registered as a pre-condition for the future rule-5 real-model slice, not a gap in what shipped here. | AI Governance / whoever picks up the real-model slice |
| No golden set / no eval-refresh cadence (AI-risk finding) | Same reasoning — nothing generative exists to drift or need a golden set against. Not applicable today. | AI Governance / future rule-5 slice |
| `02-impl-notes.md` file-purpose table states "20 tests" for `test/summary.test.js" where the actual count is 14 (already flagged by AI Governance as cosmetic-only) | Independently confirmed cosmetic: the document's own later verify-commands section states "+14, 35→49," which matches the actual `npm test` output exactly. Does not affect shipped code or coverage. | Advisory only — no owner action required |
| Audit-only-on-success ordering (no "attempted" event, unlike `digest.js`'s two-event pattern) | Engineer flagged this explicitly as a spec-interpretation choice for QA/Governance visibility (impl notes, deviation 3). Read `summary.js:111-114`: this is a deliberate, documented choice (a read/compose operation has no meaningful "attempted-but-not-yet-summarized" state the way a send does), not an oversight. No safety invariant requires a pre-attempt event for a read path. Not blocking. | Security & Privacy — please confirm concurrence per the engineer's explicit flag |

No test failures, no flaky tests, nothing blocked on missing input.

## Recommendation

- [x] **Pass to Security & Privacy Agent**
- [ ] Block — return to engineer

All 6 independent command runs pass (typecheck, targeted tests, full
suite, build, local regression, whitespace/diff check) — 49/49 tests
green, reproduced independently of the engineer's session. Diff
independently confirmed additive-only: 2 new files under `src/`/`test/`,
0 modified; `scripts/build-check.mjs` +1 line exactly; no existing
service touched; no new dependency. A from-scratch runtime probe (not the
engineer's tests) covering no-invention (count + snippet, including a
live delete), bidirectional user-scoping, content-freedom in audit
metadata (whole-event `JSON.stringify` check), the placeholder-throw
differential, and a bulk-delete + digest-503 regression sanity check —
21/21 assertions passed. Invariants 4 and 5 (the two that apply) verified
with citations; invariants 1–3 confirmed unaffected; invariant "7" does
not exist and is flagged, not fabricated. No deviations from spec found
beyond what the engineer and AI Governance already surfaced and scoped
correctly as future-slice pre-conditions.

## Hand off

Next agent: Security & Privacy Agent.

# Implementation Notes — llm-summary

> Stage 3 (Implementation) · Owner: AI Engineer
> Status: implemented, verified green
> Source: `runs/llm-summary/01-em-scope.md` (no separate Architect stage for
> this slice — the AI Engineer owns the deterministic-vs-LLM split and the
> adapter/placeholder shape per `agents/ai-engineer.md`, so this doc is both
> the design record and the implementation notes)

## Files created (2 new), files modified (1)

| File | Purpose |
|------|---------|
| `src/services/summary.js` | `SummarizerAdapter` typedef + `DeterministicSummarizer` (default, always works) + `PlaceholderLlmSummarizer` (always throws) + `summarizeItems(userId, adapter?)` orchestration |
| `test/summary.test.js` | 14 tests: happy paths, the 6 required safety-invariant EVAL cases, and guard cases |
| `scripts/build-check.mjs` | +1 line: added `"../src/services/summary.js"` to the import-check `modules` array (explicitly permitted by the brief; nothing else in the file touched) |

`src/services/savedItems.js` and `src/services/audit.js` — reused as-is, **not modified** (confirmed by `git diff --stat`, see below).

## Design (compressed into this stage, per 01-em-scope.md)

- `SummarizerAdapter` shape: `{ name, generationMode: "deterministic"|"llm", summarize(items) => Promise<{ text, snippet }> }`.
- `DeterministicSummarizer` (default): composes `text`/`snippet` from **only** the real `items` array it's given — the true count, and (if non-empty) a snippet that is a verbatim prefix (≤80 chars) of the most recent item's content. Zero items → `"You have no saved items yet."`, `snippet: null`. No model, no I/O, no randomness — same input always yields the same output.
- `PlaceholderLlmSummarizer`: `summarize()` unconditionally throws `"LLM summarizer is not configured in this build (PlaceholderLlmSummarizer)."` — no config/env/argument suppresses it, matching `PlaceholderEmailAdapter`'s existing convention in this repo and the canonical pattern in `agents/ai-engineer.md`.
- `summarizeItems(userId, adapter = new DeterministicSummarizer())`: guards `userId`, calls `listItems(userId)` (user-scoped, deletedAt-filtered — unmodified), delegates composition to `adapter.summarize(items)`, then emits `items.summarized` with `{ itemCount, generationMode }` — **only after** the adapter call succeeds, so a throw (the placeholder's only behavior) never gets audited as a successful summary.
- **Deliberate strengthening beyond the literal brief:** `itemCount` in both the audit event and the returned object is always `items.length` from `listItems`' real output — never read from the adapter's return value. Even if a future (Tier-3, not-yet-approved) LLM adapter's prose were to miscount, the audited/returned `itemCount` cannot drift from ground truth. This is enforced structurally, not just by test coverage.

No prompt file was created. `PlaceholderLlmSummarizer` never constructs or sends a prompt — it throws before doing any work — so there is nothing to version yet under `agents/ai-engineer.md`'s "prompts are named/versioned" quality bar. That applies once a real model is wired (separate, future rule-5 approval per `APPROVAL_RECORD-1.md`).

## Verify commands (run from repo root, in the order requested)

### `npm run typecheck`
```
> stash-seed@0.1.0 typecheck
> for f in $(find src scripts -type f \( -name '*.js' -o -name '*.mjs' \)); do node --check "$f" || exit 1; done; echo "typecheck ok"

typecheck ok
```

### `npm test`
```
✔ summarizeItems: guard — missing/empty userId throws TypeError, no audit event (0.100208ms)
ℹ tests 49
ℹ suites 0
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 167.815167
```
**Test count: 35 before → 49 after** (+14 in `test/summary.test.js`). All pre-existing tests (`savedItems.test.js`, `digest.test.js`, `server.test.js`) pass unmodified.

### `npm run build`
```
> stash-seed@0.1.0 build
> node scripts/build-check.mjs

build ok
```
`summary.js` added to the import-check list; imports cleanly alongside every other service and `server.js`.

### `npm run qa:mvp`
```
> stash-seed@0.1.0 qa:mvp
> npm run typecheck && npm run test
...
typecheck ok
...
ℹ tests 49
ℹ pass 49
ℹ fail 0
```
Green on the first attempt — **no retries needed, failure budget untouched (0/2)**, no failure category to record.

## Spec deviations / interpretation notes

1. **"Most recent item" = last in `listItems`' output (insertion order).** The data model (`savedItems.js`) has no `createdAt`/timestamp field — only `itemId` sequence and Map insertion order, which `listItems` already preserves per-user. This is the only available notion of recency, and it matches how `digest.js` already treats `listItems`' output ("input order" per its own JSDoc). Documented inline in `summary.js`.
2. **No item "type" classification (links/notes).** `00-slice-plan.md`'s Stage-1 sketch imagined a richer summary ("8 links, 4 notes"), but the item schema is a single free-text `content` field with no type. `01-em-scope.md` (the authoritative, most-recent input, addressed to the AI Engineer) correctly narrows this to count + content snippet only. Inventing a type classification the data doesn't actually carry would itself violate the no-invention anti-pattern, so the narrower brief was followed over the earlier sketch.
3. **Audit-only-on-success**, rather than `digest.js`'s attempt-then-final two-event pattern. `digest.js` emits an "attempted" event before the (always-throwing) adapter call because invariant-3-style reasoning wants an audit trail even for attempted sends. The brief for this slice only asks for one event, `items.summarized`, describing a produced summary; there's no equivalent "attempted" semantics requested, and emitting an event that claims a summary was attempted/produced when `PlaceholderLlmSummarizer` immediately threw would arguably be its own small invention. Flagging this choice explicitly for QA/Governance review since it's the one place this implementation's audit ordering differs from the closest prior art in this repo.
4. **Snippet truncation length (80 chars)** is an implementation choice, not specified in the brief. Truncation always takes a prefix (`content.slice(0, 80)`), so the returned `snippet` field is always a true substring by construction, independent of the exact length chosen.

## Boundary-integrity spot-check (for Security & Privacy)

`grep -rn "Summarizer" src/` — every match is either the typedef name, the two class definitions/docs, or the throw message; the only adapter ever *constructed* under `src/` is `new DeterministicSummarizer()` as `summarizeItems`'s default parameter:
```
src/services/summary.js:127:export async function summarizeItems(userId, adapter = new DeterministicSummarizer()) {
```
`PlaceholderLlmSummarizer` is exported but never auto-constructed anywhere in `src/` — it only appears when a caller (or a test) explicitly injects it, which is the point: nothing in this build can silently reach the LLM path.

Also confirmed: no `console.*` or `process.env` reads in `summary.js`; `package.json`/lockfile untouched (no new dependency); no network-capable API used anywhere in the new code.

## What QA should spot-check

1. **No-invention, specifically.** Run the EVAL case `"claimed itemCount always equals listItems(userId).length"` (`test/summary.test.js`) mentally against a hand-picked scenario: add 3 items, soft-delete 1, call `summarizeItems` — confirm the returned `itemCount` is 2 (not 3), and that the snippet — if you inspect it — is a substring of whichever item is actually last among the *live* two, not the deleted one. This is the core anti-pattern the brief calls out by name; worth an independent manual check beyond trusting the automated eval.
2. **Audit metadata never carries content**, even under adversarial-looking input. The eval seeds an item with an obviously sensitive-looking string ("very secret payload nobody should log") and asserts it's absent from `JSON.stringify(evt.metadata)`. Worth re-running with a longer/weirder content string (e.g. containing the literal substrings `"itemCount"` or `"generationMode"`) to be sure nothing about the audit shape is content-derived rather than hard-coded.
3. **The differential is real, not coincidental.** Compare the "placeholder throws" eval against the "default succeeds" eval in the same test — the *only* variable is which adapter is passed to `summarizeItems`. Confirm by construction (reading `summarizeItems`'s body, ~10 lines) that there's exactly one code path, and it's the adapter's `summarize()` call that's the sole source of the differing behavior — not two different orchestration branches that happen to agree with the spec.

## Rollback

Not exercised (no failure occurred). Two new files (`src/services/summary.js`, `test/summary.test.js`) plus a one-line addition to `scripts/build-check.mjs`. `git revert <this-commit>` is the one-shot equivalent. `grep -rn "Summarizer\|summarizeItems" src/ test/` returning nothing would confirm a clean rollback.

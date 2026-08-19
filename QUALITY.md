# Code Quality — generated

_Generated 2026-08-19T06:11:27Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/quality.mjs .`._

> **Measure-only.** These metrics never gate a release. They describe the
> code's shape so a reviewer can look where it matters; whether any of them
> should block a slice is a decision earned by evidence, not asserted here.

## Summary

- Source files: **6** · Source SLOC: **271**
- Approx. complexity: median **5**, max **29**
- Largest file: **94** SLOC
- Test:source SLOC ratio: **2.64×** (4 test file(s)) — *presence signal, not coverage*
- Files flagged for a glance: **1/6**

## Per file

| File | SLOC | Approx. cx | Fns | Cx/SLOC | Flags |
|------|------|-----------|-----|---------|-------|
| src/server.js | 94 | 29 | 8 | 0.309 | dense |
| src/services/savedItems.js | 52 | 11 | 7 | 0.212 | — |
| src/services/digest.js | 52 | 5 | 6 | 0.096 | — |
| src/services/summary.js | 45 | 4 | 1 | 0.089 | — |
| src/services/audit.js | 18 | 1 | 4 | 0.056 | — |
| src/services/emailAdapter.js | 10 | 1 | 0 | 0.1 | — |

## Flags

A flag is "worth a human glance", never "broken".

- **src/server.js** — 0.309 decisions/SLOC (> 0.3)

## Thresholds

- Large file: **> 250** SLOC · High complexity: **> 60** · Dense: **> 0.3** decisions/SLOC (files ≥ 20 SLOC only)
- Calibrated from observed seed-repo code, not pulled from the air — the same discipline as analyze.mjs's density caps.

## What this is NOT

- **Not coverage.** The test ratio is test-SLOC / source-SLOC — a presence signal. Real coverage needs an instrumented run; this tool never executes code.
- **Not a parser.** Complexity is a per-file decision-point approximation; it omits ternary/optional-chaining `?` to avoid false positives, and does not attribute complexity to individual functions.
- **Not a gate.** Nothing here fails a build. That decision waits on a real slice.

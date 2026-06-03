# Local Commands — Stash (seed)

| Purpose | Command |
|---------|---------|
| Syntax check (typecheck) | `npm run typecheck` |
| Tests | `npm test` (runs `node --test`) |
| Targeted test | `node --test test/<file>.test.js` |
| Build (import check) | `npm run build` |
| Local regression (QA gate) | `npm run qa:mvp` |

## Notes

- Dependency-free: no `npm install` needed. Node 18+ only.
- No command makes a network call. There is no LLM in this build.
- Never bypass hooks (`--no-verify`).

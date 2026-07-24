# Slice — deploy smoke + rollback drill (Phase 2c)

> Tier 2 (infra / tooling). Compressed slice — built directly with full gate
> discipline, same rationale as `runs/http-api/notes.md`.

## What shipped

The "deploy half" for the reference app:

- **Deploy** (local): `npm start` runs the server (`PORT`, default 3000).
- **Post-deploy smoke** (`npm run smoke` / `scripts/smoke.mjs`): runs against
  a *running* server and enforces the **safety invariant at the deploy
  boundary** — health, add, user-scoped reads, and critically that `/digest`
  returns **503** and leaks no item content. A build that looks healthy but
  would send/leak fails here.
- **Executed rollback drill** (`npm run rollback:drill`): deploy good →
  deploy a regressed build → roll back, asserting the bad deploy is caught
  and rollback restores service.
- **CI gate**: the drill runs on every push/PR (`.github/workflows/ci.yml`),
  so the deploy half is enforced, not just documented.

## The rollback drill — executed output

The regressed fixture (`scripts/drill/regressed-server.mjs`) deliberately
passes `/health` (200) but returns `/digest` 200 with item content — the
exact leak the shipped build's throwing placeholder prevents. A naive
liveness check would miss it; the smoke does not.

```
Rollback drill — deploy good, deploy bad, roll back:

  ✓ deploy v-good: smoke PASS (expected PASS)
  ✓ deploy v-bad (regressed — healthy but leaks): smoke FAIL (expected FAIL)
      caught: digest cannot send (503), digest leaks no content
  ✓ rollback to v-good: smoke PASS (expected PASS)

DRILL: PASS — bad deploy caught by smoke, rollback restored service.
```

## What it proves

- **Rollback is tested, not assumed** (the playbook's rule for ML Engineer /
  SRE, now applied to app deploys).
- The post-deploy smoke enforces a **safety** property, not just liveness —
  a "green health, red safety" build is caught before it serves traffic.

## Non-goals (future)

Real cloud deploy target (Fly / Cloudflare), blue-green / canary, and an
automatic rollback *controller* (this drill runs on demand + in CI; it does
not yet auto-trigger rollback in a live environment). Auth on the HTTP
surface remains the top pre-exposure follow-up from Phase 2b.

# stash-seed

A deliberately small saved-items app — add an item, list it, bulk-delete,
email a digest, summarise it. **The app is not the point.** It exists so the
[Agentic SDLC](https://github.com/gpatwa/agentic-sdlc-playbook) can be run on
real code with real gates, and so the claim "this methodology works" can be
checked rather than asserted.

The interesting directory is [`runs/`](runs/), not [`src/`](src/).

## Run it

Node 18+, no dependencies, no install step.

```bash
npm run qa:mvp   # typecheck + the full suite (51 tests)
npm start        # HTTP surface on 127.0.0.1:3000
npm run smoke    # post-deploy smoke check
```

## What's actually in here

| Path | What it is |
|------|-----------|
| `src/services/` | The product: saved items, audit log, digest, summariser |
| `src/server.js` | Dependency-free `node:http` surface, **loopback-only** |
| `.agentic/` | The context every agent reads first — including `SAFETY_INVARIANTS.md` |
| `runs/` | **The record.** One directory per slice: every artefact, the durable state file, and machine-readable telemetry |
| `runs/ANALYTICS.md` | Generated from the traces — cost, DORA, and the outliers each run flags on itself |

## The runs

Each slice was carried by a pipeline of specialised agents handing off through
artefacts, with gates between them and a human at the points that can't be
undone. The write-ups are candid on purpose — they record what went wrong, not
just what shipped.

| Slice | What it exercised |
|-------|-------------------|
| [`run-1`](runs/run-1/) | First live run: agents execute the pipeline on real code |
| [`email-digest`](runs/email-digest/) | **Human-approval interrupt** — the run paused for an explicit yes before anything could send |
| [`http-api`](runs/http-api/), [`deploy`](runs/deploy/) | HTTP surface, CI gates, an executed rollback drill |
| [`llm-summary`](runs/llm-summary/) | Deterministic-first AI: the feature works with no model, and wiring a real one is a separate approval |
| [`eval/`](runs/eval/) | Two red-team evals — an unsafe ask **refused at intake**, and an impossible one **escalated without weakening a gate** |

## Honest notes

- **Prototype storage.** Everything is in-memory; restarting loses it. That is
  deliberate — the slices are about lifecycle machinery, not persistence.
- **No auth.** `userId` is a self-asserted header. The server binds `127.0.0.1`
  explicitly and *unreachability is the security control*. It was not always:
  a security review caught it listening on every interface, which is recorded
  in the run notes rather than quietly fixed.
- **Fictional product.** No real users, no real data, nothing to deploy.

## More

The methodology, the 24 agent briefs, the gates and the approval rules live in
the [playbook](https://github.com/gpatwa/agentic-sdlc-playbook). The other
reference app — built 0→1 from a single paragraph — is
[streak-seed](https://github.com/gpatwa/streak-seed).

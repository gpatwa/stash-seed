// Post-deploy smoke test — runs against a RUNNING server, not the unit suite.
// It enforces the safety invariant at the deploy boundary: a build that
// "looks healthy" but would send/leak must fail here, not in production.
// Exportable (used by the rollback drill) and runnable as a CLI.

export async function smoke(base) {
  const checks = [];
  const chk = (name, ok, detail = "") => checks.push({ name, ok, detail });

  try {
    const r = await fetch(base + "/health");
    const j = await r.json().catch(() => ({}));
    chk("health 200 ok", r.status === 200 && j.status === "ok", `status ${r.status}`);
  } catch (e) {
    chk("health 200 ok", false, e.message);
  }

  try {
    const r = await fetch(base + "/items", {
      method: "POST",
      body: JSON.stringify({ userId: "smoke-u1", content: "smoke-item-CONTENT" }),
    });
    const j = await r.json().catch(() => ({}));
    chk("add item 201", r.status === 201 && !!j.itemId, `status ${r.status}`);
  } catch (e) {
    chk("add item 201", false, e.message);
  }

  try {
    const a = await (await fetch(base + "/items?userId=smoke-u1")).json();
    const b = await (await fetch(base + "/items?userId=smoke-u2")).json();
    chk("reads are user-scoped", a.items.length >= 1 && b.items.length === 0);
  } catch (e) {
    chk("reads are user-scoped", false, e.message);
  }

  // The safety gate: the digest must NOT send (placeholder throws -> 503) and
  // must not echo item content. A regressed build that returns 200 here is
  // exactly what this check exists to catch.
  try {
    const r = await fetch(base + "/digest", {
      method: "POST",
      body: JSON.stringify({ userId: "smoke-u1", recipient: "smoke@example.com" }),
    });
    const body = await r.text();
    chk("digest cannot send (503)", r.status === 503, `status ${r.status}`);
    chk("digest leaks no content", !body.includes("smoke-item-CONTENT"));
  } catch (e) {
    chk("digest cannot send (503)", false, e.message);
  }

  return { ok: checks.every((c) => c.ok), checks };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.env.SMOKE_BASE || `http://localhost:${process.env.PORT || 3000}`;
  const { ok, checks } = await smoke(base);
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? "  (" + c.detail + ")" : ""}`);
  console.log(ok ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(ok ? 0 : 1);
}

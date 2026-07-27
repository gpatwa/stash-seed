import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createStashServer } from "../src/server.js";
import { _reset as resetItems } from "../src/services/savedItems.js";
import { _reset as resetAudit } from "../src/services/audit.js";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";

let server;
let base;

before(async () => {
  server = createStashServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

const post = (path, body) =>
  fetch(base + path, { method: "POST", body: JSON.stringify(body) });

test("GET /health -> 200 ok", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("add then list is user-scoped over HTTP", async () => {
  resetItems();
  resetAudit();
  const add = await post("/items", { userId: "u1", content: "hello" });
  assert.equal(add.status, 201);
  assert.ok((await add.json()).itemId);

  const u2 = await (await fetch(`${base}/items?userId=u2`)).json();
  assert.equal(u2.items.length, 0, "u2 must not see u1's items");
  const u1 = await (await fetch(`${base}/items?userId=u1`)).json();
  assert.equal(u1.items.length, 1);
});

test("bulk-delete over HTTP returns deleted/skipped", async () => {
  resetItems();
  resetAudit();
  const { itemId } = await (await post("/items", { userId: "u1", content: "x" })).json();
  const res = await post("/items/bulk-delete", { userId: "u1", itemIds: [itemId, "ghost"] });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.deleted, [itemId]);
  assert.deepEqual(body.skipped, ["ghost"]);
});

test("bulk-delete bad input -> 400, no crash", async () => {
  const res = await post("/items/bulk-delete", { userId: "u1", itemIds: [] });
  assert.equal(res.status, 400);
});

test("digest endpoint -> 503 (placeholder throws), leaks no internals", async () => {
  resetItems();
  resetAudit();
  await post("/items", { userId: "u1", content: "SECRET-XYZ" });
  const res = await post("/digest", { userId: "u1", recipient: "probe@example.com" });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "email sending is not configured");
  const dump = JSON.stringify(body).toLowerCase();
  assert.ok(!dump.includes("placeholder"), "no adapter internals in the response");
  assert.ok(!dump.includes("secret-xyz"), "no item content in the response");
});

test("unknown route -> 404", async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
});

test("missing userId -> 400", async () => {
  assert.equal((await fetch(`${base}/items`)).status, 400);
});

test("invalid JSON body -> 400, no crash", async () => {
  const res = await fetch(`${base}/items`, { method: "POST", body: "{not json" });
  assert.equal(res.status, 400);
});

// ── bind surface ───────────────────────────────────────────────────────────
// Regression guard: the entry point must bind loopback only. This seed has no
// auth, so unreachability is the security control — a wildcard bind put
// user-scoped read + bulk-delete on the LAN. Two layers: a structural pin on the
// source, and a live check against the real process.

test("entry point pins loopback: LISTEN_HOST is 127.0.0.1 and listen() passes a host", async () => {
  const { LISTEN_HOST } = await import("../src/server.js");
  assert.equal(LISTEN_HOST, "127.0.0.1");
  const src = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(
    src,
    /\.listen\(\s*port\s*,\s*LISTEN_HOST\s*,/,
    "listen() must receive an explicit host — listen(port, cb) binds 0.0.0.0",
  );
});

test("running server binds loopback, not the wildcard address", async () => {
  const port = 45699;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on("data", (d) => String(d).includes("listening") && resolve());
      child.on("error", reject);
      setTimeout(() => reject(new Error("server did not start")), 5000);
    });
    // loopback is served
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
    // a non-loopback local address is NOT served
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
    if (lan) {
      await assert.rejects(
        () => fetch(`http://${lan}:${port}/health`, { signal: AbortSignal.timeout(2000) }),
        "a non-loopback address must not be served",
      );
    }
  } finally {
    child.kill();
  }
});

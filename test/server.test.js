import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createStashServer } from "../src/server.js";
import { _reset as resetItems } from "../src/services/savedItems.js";
import { _reset as resetAudit } from "../src/services/audit.js";

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

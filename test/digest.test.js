import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeDigest,
  recipientHash,
  sendItemsDigest,
} from "../src/services/digest.js";
import { PlaceholderEmailAdapter } from "../src/services/emailAdapter.js";
import {
  addItem,
  _reset as resetItems,
} from "../src/services/savedItems.js";
import {
  listAuditEvents,
  _reset as resetAudit,
} from "../src/services/audit.js";

// ── composeDigest: pure, no adapter ─────────────────────────────────────────

// T-C1
test("composeDigest: N live items → itemCount, ordered itemIds, content present, subject reflects count", () => {
  resetItems();
  resetAudit();
  const items = [
    { itemId: "item_1", content: "alpha" },
    { itemId: "item_2", content: "beta" },
    { itemId: "item_3", content: "gamma" },
  ];

  const payload = composeDigest(items);

  assert.equal(payload.itemCount, 3);
  assert.deepEqual(payload.itemIds, ["item_1", "item_2", "item_3"]);
  for (const item of items) {
    assert.ok(
      payload.items.some(
        (i) => i.itemId === item.itemId && i.content === item.content,
      ),
      `payload.items must contain ${item.itemId}`,
    );
    assert.ok(payload.body.includes(item.content));
  }
  assert.ok(payload.subject.includes("3"));
});

// T-C2
test("composeDigest: empty input → well-formed itemCount:0 payload, never throws, never null", () => {
  resetItems();
  resetAudit();

  let payload;
  assert.doesNotThrow(() => {
    payload = composeDigest([]);
  });

  assert.ok(payload !== null && payload !== undefined);
  assert.equal(payload.itemCount, 0);
  assert.deepEqual(payload.itemIds, []);
  assert.deepEqual(payload.items, []);
  assert.equal(typeof payload.body, "string");
  assert.ok(payload.body.length > 0);
  assert.equal(typeof payload.subject, "string");
});

// T-C3
test("composeDigest: deterministic — same input array yields deep-equal payload", () => {
  resetItems();
  resetAudit();
  const items = [
    { itemId: "item_1", content: "alpha" },
    { itemId: "item_2", content: "beta" },
  ];

  const first = composeDigest(items);
  const second = composeDigest(items);

  assert.deepEqual(first, second);
});

// ── PlaceholderEmailAdapter ──────────────────────────────────────────────────

// T-A1
test("PlaceholderEmailAdapter: send always rejects, message names the adapter, no argument resolves", async () => {
  resetItems();
  resetAudit();
  const adapter = new PlaceholderEmailAdapter();

  await assert.rejects(
    () =>
      adapter.send({
        recipient: "u1@example.test",
        subject: "s",
        body: "b",
      }),
    /not configured in this build/,
  );
  await assert.rejects(() => adapter.send(), /PlaceholderEmailAdapter/);
});

// T-A2
test("PlaceholderEmailAdapter: name is the stable boundary name", () => {
  resetItems();
  resetAudit();
  const adapter = new PlaceholderEmailAdapter();
  assert.equal(adapter.name, "email-adapter-boundary");
});

// ── sendItemsDigest: throw path (default placeholder) ───────────────────────

// T-S1
test("sendItemsDigest: throw path — rejects via placeholder, network-free", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "hello");

  await assert.rejects(
    () => sendItemsDigest("u1", "u1@example.test"),
    /not configured in this build/,
  );
});

// T-S2
test("sendItemsDigest: throw path — exactly one attempted event, zero sent events", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "hello");

  await assert.rejects(() => sendItemsDigest("u1", "u1@example.test"));

  const events = listAuditEvents("u1");
  assert.equal(
    events.filter((e) => e.type === "items.digest_send_attempted").length,
    1,
  );
  assert.equal(
    events.filter((e) => e.type === "items.digest_sent").length,
    0,
  );
});

// T-S3
test("sendItemsDigest: attempt metadata carries only itemIds/itemCount/recipientHash", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "secret content");

  await assert.rejects(() => sendItemsDigest("u1", "u1@example.test"));

  const [event] = listAuditEvents("u1").filter(
    (e) => e.type === "items.digest_send_attempted",
  );
  const meta = event.metadata;
  assert.ok("itemIds" in meta);
  assert.ok("itemCount" in meta);
  assert.ok("recipientHash" in meta);
  assert.equal(Object.keys(meta).length, 3);
  assert.ok(!("content" in meta));
  assert.ok(!("title" in meta));
  assert.ok(!("subject" in meta));
  assert.ok(!("body" in meta));
  assert.ok(!("recipient" in meta));
});

// T-S4
test("sendItemsDigest: recipientHash matches helper; raw recipient appears nowhere in the event", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "hello");
  const recipient = "u1@example.test";

  await assert.rejects(() => sendItemsDigest("u1", recipient));

  const [event] = listAuditEvents("u1").filter(
    (e) => e.type === "items.digest_send_attempted",
  );
  assert.equal(event.metadata.recipientHash, recipientHash(recipient));
  assert.notEqual(event.metadata.recipientHash, recipient);
  assert.ok(!JSON.stringify(event).includes(recipient));
});

// ── sendItemsDigest: user scoping (invariant 5) ──────────────────────────────

// T-S5
test("sendItemsDigest: user scoping — attempt itemIds are u1's own only, never u2's", async () => {
  resetItems();
  resetAudit();
  const u1a = addItem("u1", "mine-1");
  const u1b = addItem("u1", "mine-2");
  const u2a = addItem("u2", "theirs-1");

  await assert.rejects(() => sendItemsDigest("u1", "u1@example.test"));

  const [event] = listAuditEvents("u1").filter(
    (e) => e.type === "items.digest_send_attempted",
  );
  const idSet = new Set(event.metadata.itemIds);
  assert.ok([...idSet].every((id) => id === u1a || id === u1b));
  assert.ok(!idSet.has(u2a));
});

// T-S6
test("sendItemsDigest: attempt event visible under u1's log, absent from u2's", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "mine");
  addItem("u2", "theirs");

  await assert.rejects(() => sendItemsDigest("u1", "u1@example.test"));

  assert.equal(
    listAuditEvents("u1").filter(
      (e) => e.type === "items.digest_send_attempted",
    ).length,
    1,
  );
  assert.equal(
    listAuditEvents("u2").filter(
      (e) => e.type === "items.digest_send_attempted",
    ).length,
    0,
  );
});

// ── sendItemsDigest: empty items ─────────────────────────────────────────────

// T-S7
test("sendItemsDigest: zero live items → one itemCount:0 attempt event, then throws", async () => {
  resetItems();
  resetAudit();

  await assert.rejects(
    () => sendItemsDigest("u1", "u1@example.test"),
    /not configured in this build/,
  );

  const attempted = listAuditEvents("u1").filter(
    (e) => e.type === "items.digest_send_attempted",
  );
  assert.equal(attempted.length, 1);
  assert.equal(attempted[0].metadata.itemCount, 0);
  assert.deepEqual(attempted[0].metadata.itemIds, []);
});

// ── sendItemsDigest: guards (mirror bulk-delete) ─────────────────────────────

// T-S8
test("sendItemsDigest: guard — empty/null userId throws TypeError, no audit event, no adapter call", async () => {
  resetItems();
  resetAudit();
  let sendCalls = 0;
  const spyAdapter = {
    name: "spy",
    async send() {
      sendCalls += 1;
    },
  };

  await assert.rejects(
    () => sendItemsDigest("", "u1@example.test", spyAdapter),
    TypeError,
  );
  await assert.rejects(
    () => sendItemsDigest(null, "u1@example.test", spyAdapter),
    TypeError,
  );

  assert.equal(sendCalls, 0);
  assert.equal(listAuditEvents("u1").length, 0);
});

// T-S9
test("sendItemsDigest: guard — empty/missing recipient throws TypeError, no audit event, no adapter call", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "hello");
  let sendCalls = 0;
  const spyAdapter = {
    name: "spy",
    async send() {
      sendCalls += 1;
    },
  };

  await assert.rejects(() => sendItemsDigest("u1", "", spyAdapter), TypeError);
  await assert.rejects(
    () => sendItemsDigest("u1", null, spyAdapter),
    TypeError,
  );

  assert.equal(sendCalls, 0);
  assert.equal(listAuditEvents("u1").length, 0);
});

// ── sendItemsDigest: success path via injected no-op stub (differential) ────

// T-S10
test("sendItemsDigest: injected resolving stub — resolves, exactly one digest_sent, clean metadata, no content leak", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "alpha");
  addItem("u1", "beta");

  const sentMessages = [];
  const noopAdapter = {
    name: "test-noop-adapter",
    async send(message) {
      sentMessages.push(message);
    },
  };

  const result = await sendItemsDigest(
    "u1",
    "u1@example.test",
    noopAdapter,
  );

  assert.deepEqual(result, { itemCount: 2 });
  assert.equal(sentMessages.length, 1, "adapter.send must be called exactly once");

  const events = listAuditEvents("u1");
  assert.equal(
    events.filter((e) => e.type === "items.digest_send_attempted").length,
    1,
  );
  const sent = events.filter((e) => e.type === "items.digest_sent");
  assert.equal(sent.length, 1);

  const meta = sent[0].metadata;
  assert.ok("itemIds" in meta);
  assert.ok("itemCount" in meta);
  assert.ok("recipientHash" in meta);
  assert.equal(Object.keys(meta).length, 3);
  assert.ok(!("content" in meta));
  assert.equal(meta.itemCount, 2);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addItem,
  listItems,
  softDeleteItem,
  bulkDeleteItems,
  setItemFolder,
  clearFolderFromItems,
  _getItem,
  _reset as resetItems,
} from "../src/services/savedItems.js";
import { listAuditEvents, _reset as resetAudit } from "../src/services/audit.js";

test("add and list items are scoped by user", () => {
  resetItems();
  resetAudit();
  const a = addItem("u1", "hello");
  addItem("u2", "other");
  const list = listItems("u1");
  assert.equal(list.length, 1);
  assert.equal(list[0].itemId, a);
});

test("soft delete removes from list, keeps recoverable, and audits", () => {
  resetItems();
  resetAudit();
  const a = addItem("u1", "x");
  assert.equal(softDeleteItem("u1", a), true);
  assert.equal(listItems("u1").length, 0);
  // recoverable: still present with a deletedAt
  assert.ok(_getItem(a).deletedAt !== null);
  // audited
  const events = listAuditEvents("u1");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "items.deleted");
});

test("cannot delete another user's item", () => {
  resetItems();
  resetAudit();
  const a = addItem("u1", "x");
  assert.equal(softDeleteItem("u2", a), false);
  assert.equal(listItems("u1").length, 1);
});

// ── bulkDeleteItems tests ──────────────────────────────────────────────────

// Case 1: Happy path — all IDs owned by user
test("bulkDeleteItems: happy path — all IDs owned by user", () => {
  resetItems();
  resetAudit();
  const id1 = addItem("u1", "a");
  const id2 = addItem("u1", "b");

  const result = bulkDeleteItems("u1", [id1, id2]);

  assert.deepEqual(result.deleted, [id1, id2]);
  assert.deepEqual(result.skipped, []);
  assert.ok(_getItem(id1).deletedAt !== null);
  assert.ok(_getItem(id2).deletedAt !== null);
  assert.equal(listItems("u1").length, 0);

  const events = listAuditEvents("u1");
  // two individual items.deleted + one items.bulk_deleted
  const deletedEvents = events.filter((e) => e.type === "items.deleted");
  const bulkEvents = events.filter((e) => e.type === "items.bulk_deleted");
  assert.equal(deletedEvents.length, 2);
  assert.equal(bulkEvents.length, 1);
  assert.equal(bulkEvents[0].metadata.requestedCount, 2);
  assert.equal(bulkEvents[0].metadata.deletedCount, 2);
  assert.equal(bulkEvents[0].metadata.skippedCount, 0);
});

// Case 2: Partial match — mix of own and other-user IDs
test("bulkDeleteItems: partial match — own IDs deleted, other-user IDs skipped", () => {
  resetItems();
  resetAudit();
  const ownId = addItem("u1", "mine");
  const otherId = addItem("u2", "theirs");

  const result = bulkDeleteItems("u1", [ownId, otherId]);

  assert.deepEqual(result.deleted, [ownId]);
  assert.deepEqual(result.skipped, [otherId]);
  // other user's item is untouched
  assert.equal(_getItem(otherId).deletedAt, null);
});

// Case 3: Already-deleted ID in list
test("bulkDeleteItems: already-deleted ID lands in skipped, no duplicate audit event", () => {
  resetItems();
  resetAudit();
  const id = addItem("u1", "x");
  softDeleteItem("u1", id); // delete first
  resetAudit(); // clear prior events so counts are clean

  const result = bulkDeleteItems("u1", [id]);

  assert.deepEqual(result.deleted, []);
  assert.deepEqual(result.skipped, [id]);

  const bulkEvents = listAuditEvents("u1").filter(
    (e) => e.type === "items.bulk_deleted",
  );
  assert.equal(bulkEvents.length, 1);
  assert.equal(bulkEvents[0].metadata.deletedCount, 0);
  assert.equal(bulkEvents[0].metadata.skippedCount, 1);
  // no extra items.deleted event was emitted
  const deletedEvents = listAuditEvents("u1").filter(
    (e) => e.type === "items.deleted",
  );
  assert.equal(deletedEvents.length, 0);
});

// Case 4: All IDs unknown
test("bulkDeleteItems: all IDs unknown — returns empty deleted, one bulk event", () => {
  resetItems();
  resetAudit();

  const result = bulkDeleteItems("u1", ["ghost1", "ghost2"]);

  assert.deepEqual(result.deleted, []);
  assert.deepEqual(result.skipped, ["ghost1", "ghost2"]);

  const bulkEvents = listAuditEvents("u1").filter(
    (e) => e.type === "items.bulk_deleted",
  );
  assert.equal(bulkEvents.length, 1);
  assert.equal(bulkEvents[0].metadata.deletedCount, 0);
});

// Case 5: Guard — empty array
test("bulkDeleteItems: guard — empty array throws TypeError, no mutation, no audit", () => {
  resetItems();
  resetAudit();
  const id = addItem("u1", "x");

  assert.throws(() => bulkDeleteItems("u1", []), TypeError);
  // no mutation
  assert.equal(_getItem(id).deletedAt, null);
  // no audit event
  assert.equal(listAuditEvents("u1").length, 0);
});

// Case 6: Guard — missing userId
test("bulkDeleteItems: guard — missing userId throws TypeError, no mutation, no audit", () => {
  resetItems();
  resetAudit();
  const id = addItem("u1", "x");

  assert.throws(() => bulkDeleteItems("", [id]), TypeError);
  assert.throws(() => bulkDeleteItems(null, [id]), TypeError);
  assert.equal(_getItem(id).deletedAt, null);
  assert.equal(listAuditEvents("u1").length, 0);
});

// Case 7: User isolation — cross-user call never deletes foreign item
test("bulkDeleteItems: user isolation — u2 cannot delete u1's item", () => {
  resetItems();
  resetAudit();
  const id = addItem("u1", "private");

  const result = bulkDeleteItems("u2", [id]);

  assert.deepEqual(result.skipped, [id]);
  assert.deepEqual(result.deleted, []);
  assert.equal(_getItem(id).deletedAt, null, "u1 item must remain un-deleted");
});

// Case 8: Audit payload shape — no content field
test("bulkDeleteItems: audit payload shape — contains counts/IDs, not content", () => {
  resetItems();
  resetAudit();
  const id1 = addItem("u1", "secret content");
  const id2 = addItem("u1", "more secrets");
  // make id2 a skipped one
  const badId = "not-an-item";

  bulkDeleteItems("u1", [id1, badId]);

  const bulkEvent = listAuditEvents("u1").find(
    (e) => e.type === "items.bulk_deleted",
  );
  assert.ok(bulkEvent, "bulk event must exist");
  const meta = bulkEvent.metadata;
  assert.ok("requestedCount" in meta);
  assert.ok("deletedCount" in meta);
  assert.ok("skippedCount" in meta);
  assert.ok("deletedIds" in meta);
  assert.ok("skippedIds" in meta);
  assert.ok(!("content" in meta), "content must never appear in audit metadata");
});

// Case 9: Single-item list — behaves identically to softDeleteItem
test("bulkDeleteItems: single-item list behaves like softDeleteItem", () => {
  resetItems();
  resetAudit();
  const id = addItem("u1", "solo");

  const result = bulkDeleteItems("u1", [id]);

  assert.deepEqual(result.deleted, [id]);
  assert.deepEqual(result.skipped, []);
  assert.ok(_getItem(id).deletedAt !== null);
  assert.equal(listItems("u1").length, 0);

  const events = listAuditEvents("u1");
  const types = events.map((e) => e.type);
  assert.ok(types.includes("items.deleted"));
  assert.ok(types.includes("items.bulk_deleted"));
});

// ── folders support (folderId field, options param, mechanics) ─────────────

// Case 19: new items default to unfoldered
test("new items default to unfoldered (folderId null, never undefined)", () => {
  resetItems();
  resetAudit();
  const id = addItem("u1", "x");
  assert.equal(_getItem(id).folderId, null);
});

// Case 20: listItems(userId) one-argument regression guard
test("listItems(userId) one-argument regression guard returns all live items regardless of folder", () => {
  resetItems();
  resetAudit();
  const a = addItem("u1", "unfoldered");
  const b = addItem("u1", "foldered");
  setItemFolder("u1", b, "fld_1");

  const list = listItems("u1");
  const ids = list.map((i) => i.itemId);
  assert.equal(list.length, 2);
  assert.ok(ids.includes(a));
  assert.ok(ids.includes(b));
});

// Case 21: listItems(userId, {}) === listItems(userId)
test("listItems(userId, {}) matches listItems(userId)", () => {
  resetItems();
  resetAudit();
  addItem("u1", "a");
  addItem("u1", "b");

  const withoutOptions = listItems("u1").map((i) => i.itemId);
  const withEmptyOptions = listItems("u1", {}).map((i) => i.itemId);
  assert.deepEqual(withEmptyOptions, withoutOptions);
});

// Case 22: {folderId: null} returns only unfoldered items
test("listItems(userId, {folderId: null}) returns only unfoldered items", () => {
  resetItems();
  resetAudit();
  const unfoldered = addItem("u1", "unfoldered");
  const foldered = addItem("u1", "foldered");
  setItemFolder("u1", foldered, "fld_1");

  const list = listItems("u1", { folderId: null });
  assert.equal(list.length, 1);
  assert.equal(list[0].itemId, unfoldered);
});

// Case 23: folder filter respects deletedAt
test("folder filter respects deletedAt — soft-deleted item in a folder is excluded", () => {
  resetItems();
  resetAudit();
  const id = addItem("u1", "x");
  setItemFolder("u1", id, "fld_1");
  softDeleteItem("u1", id);

  const list = listItems("u1", { folderId: "fld_1" });
  assert.equal(list.length, 0);
});

// Case 24: setItemFolder is user-scoped
test("setItemFolder is user-scoped", () => {
  resetItems();
  resetAudit();
  const id = addItem("u1", "x");

  const result = setItemFolder("u2", id, "fld_1");

  assert.equal(result, false);
  assert.equal(_getItem(id).folderId, null);
});

// Case 25: setItemFolder refuses a soft-deleted item
test("setItemFolder refuses a soft-deleted item", () => {
  resetItems();
  resetAudit();
  const id = addItem("u1", "x");
  softDeleteItem("u1", id);

  const result = setItemFolder("u1", id, "fld_1");

  assert.equal(result, false);
  assert.equal(_getItem(id).folderId, null);
});

// Case 26: clearFolderFromItems is user-scoped (SEC-1) — the sweep must not
// null folderId on another user's item, even when that item happens to carry
// a folderId string matching the folder being cleared (folder ids come from
// a global counter, so collisions across users are exactly the scenario the
// userId clause exists to guard against).
test("clearFolderFromItems does not clear another user's item sharing the same folderId", () => {
  resetItems();
  resetAudit();
  const u1Item = addItem("u1", "u1 content");
  const u2Item = addItem("u2", "u2 content");
  const sharedFolderId = "fld_1"; // simulate a folderId collision between users
  assert.equal(setItemFolder("u1", u1Item, sharedFolderId), true);
  assert.equal(setItemFolder("u2", u2Item, sharedFolderId), true);

  const cleared = clearFolderFromItems("u1", sharedFolderId);

  assert.deepEqual(cleared, [u1Item]);
  assert.equal(_getItem(u1Item).folderId, null);
  assert.equal(
    _getItem(u2Item).folderId,
    sharedFolderId,
    "u2's item must remain untouched by a sweep scoped to u1",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addItem,
  listItems,
  softDeleteItem,
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

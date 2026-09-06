import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFolder,
  listFolders,
  assignItemToFolder,
  deleteFolder,
  _getFolder,
  _reset as resetFolders,
} from "../src/services/folders.js";
import {
  addItem,
  listItems,
  softDeleteItem,
  _getItem,
  _reset as resetItems,
} from "../src/services/savedItems.js";
import { listAuditEvents, _reset as resetAudit } from "../src/services/audit.js";

function resetAll() {
  resetFolders();
  resetItems();
  resetAudit();
}

// 1. create a folder, it appears in listFolders
test("create a folder, it appears in listFolders", () => {
  resetAll();
  const folderId = createFolder("u1", "Recipes");
  assert.ok(folderId);
  const list = listFolders("u1");
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "Recipes");
  assert.equal(list[0].folderId, folderId);
});

// 2. createFolder rejects bad input
test("createFolder rejects bad input", () => {
  resetAll();
  assert.throws(() => createFolder("", "Recipes"), TypeError);
  assert.throws(() => createFolder(null, "Recipes"), TypeError);
  assert.throws(() => createFolder("u1", ""), TypeError);
  assert.throws(() => createFolder("u1", null), TypeError);
});

// 3. folders are user-scoped
test("folders are user-scoped", () => {
  resetAll();
  createFolder("u1", "Recipes");
  const u2Folders = listFolders("u2");
  assert.equal(u2Folders.length, 0);
});

// 4. assign, then list by folder
test("assign, then list by folder", () => {
  resetAll();
  const folderId = createFolder("u1", "Recipes");
  const itemId = addItem("u1", "pasta");
  addItem("u1", "unrelated");
  assert.equal(assignItemToFolder("u1", itemId, folderId), true);
  const list = listItems("u1", { folderId });
  assert.equal(list.length, 1);
  assert.equal(list[0].itemId, itemId);
});

// 5. reassignment replaces, never accumulates
test("reassignment replaces, never accumulates", () => {
  resetAll();
  const folderA = createFolder("u1", "A");
  const folderB = createFolder("u1", "B");
  const itemId = addItem("u1", "x");
  assert.equal(assignItemToFolder("u1", itemId, folderA), true);
  assert.equal(assignItemToFolder("u1", itemId, folderB), true);
  assert.equal(_getItem(itemId).folderId, folderB);
  assert.equal(listItems("u1", { folderId: folderA }).length, 0);
});

// 6. unfoldering
test("unfoldering via assignItemToFolder(userId, itemId, null)", () => {
  resetAll();
  const folderId = createFolder("u1", "A");
  const itemId = addItem("u1", "x");
  assignItemToFolder("u1", itemId, folderId);
  assert.equal(assignItemToFolder("u1", itemId, null), true);
  assert.equal(_getItem(itemId).folderId, null);
  const list = listItems("u1", { folderId: null });
  assert.equal(list.some((i) => i.itemId === itemId), true);
});

// 7. cross-user: my item -> their folder
test("cross-user: my item -> their folder", () => {
  resetAll();
  const theirFolder = createFolder("u2", "Theirs");
  const myItem = addItem("u1", "mine");
  resetAudit(); // isolate the assign attempt's audit outcome

  const result = assignItemToFolder("u1", myItem, theirFolder);

  assert.equal(result, false);
  assert.equal(_getItem(myItem).folderId, null);
  assert.equal(listAuditEvents("u1").length, 0);
});

// 8. cross-user: their item -> my folder
test("cross-user: their item -> my folder", () => {
  resetAll();
  const myFolder = createFolder("u1", "Mine");
  const theirItem = addItem("u2", "theirs");
  resetAudit();

  const result = assignItemToFolder("u1", theirItem, myFolder);

  assert.equal(result, false);
  assert.equal(_getItem(theirItem).folderId, null);
  assert.equal(listAuditEvents("u1").length, 0);
  assert.equal(listAuditEvents("u2").length, 0);
});

// 9. cross-user: delete their folder
test("cross-user: delete their folder", () => {
  resetAll();
  const theirFolder = createFolder("u2", "Theirs");
  const theirItem = addItem("u2", "theirs");
  assignItemToFolder("u2", theirItem, theirFolder);
  resetAudit();

  const result = deleteFolder("u1", theirFolder);

  assert.equal(result, false);
  assert.ok(_getFolder(theirFolder));
  assert.equal(_getItem(theirItem).folderId, theirFolder);
  assert.equal(listAuditEvents("u1").length, 0);
  assert.equal(listAuditEvents("u2").length, 0);
});

// 10. delete folder leaves items intact
test("delete folder leaves items intact", () => {
  resetAll();
  const folderId = createFolder("u1", "A");
  const itemId = addItem("u1", "x");
  assignItemToFolder("u1", itemId, folderId);

  assert.equal(deleteFolder("u1", folderId), true);

  const item = _getItem(itemId);
  assert.equal(item.deletedAt, null);
  assert.equal(item.folderId, null);
});

// 11. delete folder unfolders soft-deleted items too
test("delete folder unfolders soft-deleted items too", () => {
  resetAll();
  const folderId = createFolder("u1", "A");
  const itemId = addItem("u1", "x");
  assignItemToFolder("u1", itemId, folderId);
  softDeleteItem("u1", itemId);

  assert.equal(deleteFolder("u1", folderId), true);
  assert.equal(_getItem(itemId).folderId, null);
});

// 12. folder record is gone after delete
test("folder record is gone after delete", () => {
  resetAll();
  const folderId = createFolder("u1", "A");
  assert.equal(deleteFolder("u1", folderId), true);
  assert.equal(_getFolder(folderId), undefined);
  assert.equal(listFolders("u1").some((f) => f.folderId === folderId), false);
});

// 13. assigning to a nonexistent folder
test("assigning to a nonexistent folder", () => {
  resetAll();
  const itemId = addItem("u1", "x");
  resetAudit();

  const result = assignItemToFolder("u1", itemId, "fld_ghost");

  assert.equal(result, false);
  assert.equal(_getItem(itemId).folderId, null);
  assert.equal(listAuditEvents("u1").length, 0);
});

// 14. audit shape — create
test("audit shape — create", () => {
  resetAll();
  const folderId = createFolder("u1", "Recipes");
  const events = listAuditEvents("u1").filter((e) => e.type === "folders.created");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].metadata, { folderId });
});

// 15. audit shape — assign
test("audit shape — assign", () => {
  resetAll();
  const folderId = createFolder("u1", "Recipes");
  const itemId = addItem("u1", "x");
  assignItemToFolder("u1", itemId, folderId);
  const events = listAuditEvents("u1").filter((e) => e.type === "items.folder_assigned");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].metadata, { itemId, folderId });
});

// 16. audit shape — delete
test("audit shape — delete", () => {
  resetAll();
  const folderId = createFolder("u1", "Recipes");
  const item1 = addItem("u1", "x");
  const item2 = addItem("u1", "y");
  assignItemToFolder("u1", item1, folderId);
  assignItemToFolder("u1", item2, folderId);

  deleteFolder("u1", folderId);

  const events = listAuditEvents("u1").filter((e) => e.type === "folders.deleted");
  assert.equal(events.length, 1);
  assert.equal(events[0].metadata.folderId, folderId);
  assert.equal(events[0].metadata.unfolderedCount, 2);
  assert.deepEqual(events[0].metadata.unfolderedItemIds, [item1, item2]);
});

// 17. invariant 4 — no content in audit
test("invariant 4 — no content in audit", () => {
  resetAll();
  const folderId = createFolder("u1", "Secret Folder Name");
  const itemId = addItem("u1", "secret item content");
  assignItemToFolder("u1", itemId, folderId);
  deleteFolder("u1", folderId);

  const events = listAuditEvents("u1");
  for (const e of events) {
    const serialized = JSON.stringify(e.metadata);
    assert.ok(!serialized.includes("secret item content"));
    assert.ok(!("name" in e.metadata), "metadata must not carry a name key");
  }
});

// 18. invariant 5 — audit is user-scoped
test("invariant 5 — audit is user-scoped", () => {
  resetAll();
  const folderId = createFolder("u1", "A");
  const itemId = addItem("u1", "x");
  assignItemToFolder("u1", itemId, folderId);
  deleteFolder("u1", folderId);

  assert.equal(listAuditEvents("u2").length, 0);
});

// Folders service (in-memory for the seed).
// folders.js owns the folder entity and is the sole public entry point for
// the folder<->item relationship. It imports from savedItems.js; savedItems.js
// imports nothing new — this keeps the dependency graph a DAG (see
// runs/saved-item-folders/02-architecture.md, Decision 1).
import { recordAuditEvent } from "./audit.js";
import { setItemFolder, clearFolderFromItems } from "./savedItems.js";

/** @type {Map<string, {folderId:string,userId:string,name:string}>} */
const folders = new Map();
let folderSeq = 0;

/**
 * Create a folder for a user. Returns the new folderId.
 * Emits a `folders.created` audit event.
 */
export function createFolder(userId, name) {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TypeError("userId required");
  }
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("name required");
  }

  const folderId = `fld_${++folderSeq}`;
  folders.set(folderId, { folderId, userId, name });
  recordAuditEvent(userId, "folders.created", { folderId });
  return folderId;
}

/** List a user's folders. Scoped by userId, Map insertion order. Read-only, no audit. */
export function listFolders(userId) {
  return [...folders.values()].filter((f) => f.userId === userId);
}

/**
 * The single entry point for the folder<->item relationship.
 * `folderId: null` unfolders the item. Returns false (never throws) when
 * the folder is missing/not the caller's, or the item is missing/not the
 * caller's/soft-deleted. Emits `items.folder_assigned` only on true.
 *
 * @param {string} userId
 * @param {string} itemId
 * @param {string | null} folderId
 * @returns {boolean}
 */
export function assignItemToFolder(userId, itemId, folderId) {
  if (folderId !== null) {
    const folder = folders.get(folderId);
    if (!folder || folder.userId !== userId) return false;
  }

  const ok = setItemFolder(userId, itemId, folderId);
  if (!ok) return false;

  recordAuditEvent(userId, "items.folder_assigned", { itemId, folderId });
  return true;
}

/**
 * Delete a folder. Eager-unfolders every item (live or soft-deleted)
 * carrying it, then removes the folder record. Returns false for a missing
 * folder or another user's folder, with no sweep and no audit event.
 * Emits `folders.deleted` on true.
 *
 * @param {string} userId
 * @param {string} folderId
 * @returns {boolean}
 */
export function deleteFolder(userId, folderId) {
  const folder = folders.get(folderId);
  if (!folder || folder.userId !== userId) return false;

  const unfolderedItemIds = clearFolderFromItems(userId, folderId);
  folders.delete(folderId);

  recordAuditEvent(userId, "folders.deleted", {
    folderId,
    unfolderedCount: unfolderedItemIds.length,
    unfolderedItemIds,
  });
  return true;
}

/** Test/inspection helper — read a folder by id. */
export function _getFolder(folderId) {
  return folders.get(folderId);
}

/** Test helper — reset the in-memory store. */
export function _reset() {
  folders.clear();
  folderSeq = 0;
}

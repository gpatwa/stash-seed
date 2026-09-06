// Saved-items service (in-memory for the seed).
// Soft delete only: items get a deletedAt timestamp, never hard-removed.
import { recordAuditEvent } from "./audit.js";

/** @type {Map<string, {itemId:string,userId:string,content:string,deletedAt:string|null,folderId:string|null}>} */
const items = new Map();
let seq = 0;

/** Add an item for a user. Returns the new itemId. */
export function addItem(userId, content) {
  const itemId = `item_${++seq}`;
  items.set(itemId, { itemId, userId, content, deletedAt: null, folderId: null });
  return itemId;
}

/**
 * List a user's live (not soft-deleted) items. Scoped by userId.
 * `listItems(userId)` alone is unchanged behaviour — the optional `options`
 * param only takes effect when `folderId` is a key on it (so `null` can
 * mean "unfoldered items only" without being confused with "no filter").
 *
 * @param {string} userId
 * @param {{ folderId?: string | null }} [options]
 */
export function listItems(userId, options = {}) {
  const byFolder = Object.prototype.hasOwnProperty.call(options, "folderId");
  return [...items.values()].filter(
    (i) =>
      i.userId === userId &&
      i.deletedAt === null &&
      (!byFolder || i.folderId === options.folderId),
  );
}

/**
 * Soft-delete a single item. Returns true if it was deleted.
 * Emits an `items.deleted` audit event. User-scoped.
 */
export function softDeleteItem(userId, itemId) {
  const item = items.get(itemId);
  if (!item || item.userId !== userId || item.deletedAt !== null) return false;
  item.deletedAt = new Date().toISOString();
  recordAuditEvent(userId, "items.deleted", { itemId });
  return true;
}

/**
 * Soft-delete an explicit list of items for a user.
 * Delegates each deletion to softDeleteItem; emits one summary
 * `items.bulk_deleted` audit event after processing.
 *
 * @param {string}   userId
 * @param {string[]} itemIds  Must be a non-empty array of explicit IDs.
 * @returns {{ deleted: string[], skipped: string[] }}
 */
export function bulkDeleteItems(userId, itemIds) {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TypeError("userId required");
  }
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new TypeError("itemIds must be a non-empty array");
  }

  const deleted = [];
  const skipped = [];

  for (const id of itemIds) {
    if (softDeleteItem(userId, id)) {
      deleted.push(id);
    } else {
      skipped.push(id);
    }
  }

  recordAuditEvent(userId, "items.bulk_deleted", {
    requestedCount: itemIds.length,
    deletedCount: deleted.length,
    skippedCount: skipped.length,
    deletedIds: deleted,
    skippedIds: skipped,
  });

  return { deleted, skipped };
}

/**
 * Mechanic, not an entry point — `src/services/folders.js` is the sole
 * intended caller. Sets (or clears, via `folderId: null`) the folder a
 * single item belongs to. Performs no folder validation (it cannot without
 * importing `folders.js`, which would create a circular import) and emits
 * no audit event; the caller validates the folder and audits the outcome.
 * User-scoped like `softDeleteItem`.
 *
 * @param {string} userId
 * @param {string} itemId
 * @param {string | null} folderId
 * @returns {boolean} true if the item was found, owned by userId, and live.
 */
export function setItemFolder(userId, itemId, folderId) {
  const item = items.get(itemId);
  if (!item || item.userId !== userId || item.deletedAt !== null) return false;
  item.folderId = folderId;
  return true;
}

/**
 * Mechanic, not an entry point — `src/services/folders.js` is the sole
 * intended caller, used for eager unfoldering on folder delete. Walks the
 * whole store (including soft-deleted records, so no item is left pointing
 * at a removed folder) and nulls `folderId` on every record matching both
 * `userId` and `folderId`. Emits no audit event; the caller (`deleteFolder`)
 * audits the summarized outcome.
 *
 * @param {string} userId
 * @param {string} folderId
 * @returns {string[]} itemIds cleared, in Map order.
 */
export function clearFolderFromItems(userId, folderId) {
  const cleared = [];
  for (const item of items.values()) {
    if (item.userId === userId && item.folderId === folderId) {
      item.folderId = null;
      cleared.push(item.itemId);
    }
  }
  return cleared;
}

/** Test/inspection helper — read an item regardless of deletedAt. */
export function _getItem(itemId) {
  return items.get(itemId);
}

/** Test helper — reset the in-memory store. */
export function _reset() {
  items.clear();
  seq = 0;
}

// Saved-items service (in-memory for the seed).
// Soft delete only: items get a deletedAt timestamp, never hard-removed.
import { recordAuditEvent } from "./audit.js";

/** @type {Map<string, {itemId:string,userId:string,content:string,deletedAt:string|null}>} */
const items = new Map();
let seq = 0;

/** Add an item for a user. Returns the new itemId. */
export function addItem(userId, content) {
  const itemId = `item_${++seq}`;
  items.set(itemId, { itemId, userId, content, deletedAt: null });
  return itemId;
}

/** List a user's live (not soft-deleted) items. Scoped by userId. */
export function listItems(userId) {
  return [...items.values()].filter(
    (i) => i.userId === userId && i.deletedAt === null,
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

/** Test/inspection helper — read an item regardless of deletedAt. */
export function _getItem(itemId) {
  return items.get(itemId);
}

/** Test helper — reset the in-memory store. */
export function _reset() {
  items.clear();
  seq = 0;
}

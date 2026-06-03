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

/** Test/inspection helper — read an item regardless of deletedAt. */
export function _getItem(itemId) {
  return items.get(itemId);
}

/** Test helper — reset the in-memory store. */
export function _reset() {
  items.clear();
  seq = 0;
}

// Email-digest composition + orchestration (in-memory seed).
// Pure composer + a thin orchestrator that reuses listItems/recordAuditEvent
// as-is. No store of its own — nothing to reset here (see architecture doc).
import { createHash } from "node:crypto";
import { listItems } from "./savedItems.js";
import { recordAuditEvent } from "./audit.js";
import { PlaceholderEmailAdapter } from "./emailAdapter.js";

/**
 * @typedef {Object} DigestPayload
 * @property {number}   itemCount               // === items.length
 * @property {string[]} itemIds                 // input order, one per item
 * @property {{itemId:string, content:string}[]} items   // input order
 * @property {string}   subject                 // deterministic, count-based
 * @property {string}   body                     // deterministic plain-text render
 */

/**
 * Compose a deterministic digest payload from a caller-supplied array of the
 * user's LIVE items. PURE: no store reads, no I/O, no clock, no randomness —
 * same input array always yields a deep-equal payload.
 *
 * The caller is responsible for scoping/filtering (this is fed the output of
 * listItems(userId), which is already user-scoped and deletedAt-filtered).
 * This function does NOT re-scope or re-filter — it must not duplicate that
 * logic (EM constraint).
 *
 * @param {{itemId:string, content:string}[]} items
 * @returns {DigestPayload}
 */
export function composeDigest(items) {
  const itemCount = items.length;
  const itemIds = items.map((i) => i.itemId);
  const payloadItems = items.map((i) => ({ itemId: i.itemId, content: i.content }));
  const subject = `Your Stash digest: ${itemCount} saved item${itemCount === 1 ? "" : "s"}`;
  const body =
    itemCount === 0
      ? "You have no saved items right now."
      : [
          "Here are your saved items:",
          ...payloadItems.map((i) => `- ${i.content}`),
        ].join("\n");

  return { itemCount, itemIds, items: payloadItems, subject, body };
}

/**
 * One-way, truncated digest of the recipient string. node:crypto is a Node
 * core module — no new dependency (PROJECT_CONTEXT: dependency-free).
 * @param {string} recipient
 * @returns {string} 12 lowercase hex chars.
 */
export function recipientHash(recipient) {
  return createHash("sha256").update(String(recipient)).digest("hex").slice(0, 12);
}

/**
 * Compose and attempt to send a digest of the user's live items.
 * Reuses listItems (user-scoped, deletedAt-filtered) and recordAuditEvent
 * (append-only, user-scoped) AS-IS.
 *
 * @param {string} userId
 * @param {string} recipient   Explicit recipient identifier (EM constraint:
 *                             no user-profile/email-directory lookup exists;
 *                             the caller supplies it).
 * @param {EmailAdapter} [adapter]  Defaults to a new PlaceholderEmailAdapter
 *                                  (throws). Injectable seam; the ONLY adapter
 *                                  that exists in src/ is the placeholder.
 * @returns {Promise<{ itemCount:number }>}  Resolves only on a real adapter
 *          success — UNREACHABLE in this build.
 * @throws {TypeError} on missing userId or recipient (before any audit/send).
 * @throws {Error} from adapter.send — always, in this build.
 */
export async function sendItemsDigest(
  userId,
  recipient,
  adapter = new PlaceholderEmailAdapter(),
) {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TypeError("userId required");
  }
  if (typeof recipient !== "string" || recipient.length === 0) {
    throw new TypeError("recipient required");
  }

  const items = listItems(userId);
  const payload = composeDigest(items);
  const rHash = recipientHash(recipient);

  // Attempt event fires BEFORE the adapter call — load-bearing ordering, see
  // Decision 1 in the architecture doc: this is what keeps invariant 3 true
  // even though the placeholder always throws.
  recordAuditEvent(userId, "items.digest_send_attempted", {
    itemIds: payload.itemIds,
    itemCount: payload.itemCount,
    recipientHash: rHash,
  });

  await adapter.send({
    recipient,
    subject: payload.subject,
    body: payload.body,
  });

  // Unreachable with PlaceholderEmailAdapter — only a real (or test-stub)
  // adapter success reaches this line.
  recordAuditEvent(userId, "items.digest_sent", {
    itemIds: payload.itemIds,
    itemCount: payload.itemCount,
    recipientHash: rHash,
  });

  return { itemCount: payload.itemCount };
}

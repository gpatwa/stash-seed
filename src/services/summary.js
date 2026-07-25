// Item-summary service (in-memory seed).
// Deterministic-first: summarizeItems() defaults to DeterministicSummarizer,
// which composes a summary from real data ONLY — the true item count, and
// (if any) a verbatim snippet of the most recent live item's content. The
// LLM seam (PlaceholderLlmSummarizer) exists so a future slice can wire a
// real model behind the same interface; it throws by default per the
// playbook's canonical throwing-adapter pattern (agents/ai-engineer.md) and
// APPROVAL_RECORD-1.md (no real model / network / keys approved for this
// slice — that is a separate, future rule-5 approval).
import { listItems } from "./savedItems.js";
import { recordAuditEvent } from "./audit.js";

/**
 * @typedef {Object} ItemSummary
 * @property {string}      text     Human-readable summary. Deterministic
 *                                  mode: built only from the real `items`
 *                                  it was given — never states a count or
 *                                  a detail that isn't true of them.
 * @property {string|null} snippet  A verbatim excerpt of the most recent
 *                                  item's content — always a true
 *                                  substring of that item's content — or
 *                                  null when `items` is empty.
 *
 * @typedef {Object} SummarizerAdapter
 * @property {string} name  Boundary identity (adapter name).
 * @property {"deterministic"|"llm"} generationMode  Source mode; carried
 *           verbatim into the `items.summarized` audit event.
 * @property {(items: {itemId:string, content:string}[]) => Promise<ItemSummary>} summarize
 */

/** Longest snippet DeterministicSummarizer will quote from an item. */
const SNIPPET_MAX_LEN = 80;

/**
 * The default adapter. Always available — no model, no network, no I/O.
 * Composes a summary using ONLY the real `items` array it is given: the
 * true count, and (if the array is non-empty) a snippet that is a verbatim
 * prefix of the most recent item's content. Never invents a count or a
 * detail that isn't true of the input.
 *
 * "Most recent" = last in `items` (listItems' own order). The data model
 * has no separate createdAt field; itemId/Map insertion order is the only
 * notion of recency, and listItems already preserves it (savedItems.js).
 *
 * @implements {SummarizerAdapter}
 */
export class DeterministicSummarizer {
  constructor() {
    this.name = "deterministic-summarizer";
    this.generationMode = "deterministic";
  }

  /**
   * @param {{itemId:string, content:string}[]} items  Caller-scoped, live
   *        items. This function does not re-scope or re-filter them — the
   *        caller (summarizeItems) is responsible for that, same division
   *        of responsibility as digest.js's composeDigest.
   * @returns {Promise<ItemSummary>}
   */
  async summarize(items) {
    if (items.length === 0) {
      return { text: "You have no saved items yet.", snippet: null };
    }

    const mostRecent = items[items.length - 1];
    const truncated = mostRecent.content.length > SNIPPET_MAX_LEN;
    const snippet = mostRecent.content.slice(0, SNIPPET_MAX_LEN);
    const shown = truncated ? `${snippet}…` : snippet;

    const noun = items.length === 1 ? "item" : "items";
    const text = `You have ${items.length} saved ${noun}. Most recent: "${shown}"`;

    return { text, snippet };
  }
}

/**
 * The LLM seam. Throws on every call — there is no config, env var, or
 * argument that suppresses the throw (APPROVAL_RECORD-1.md: no real model /
 * network / keys approved for this slice). Message names the capability
 * AND the adapter, per the playbook's canonical throwing-placeholder
 * pattern (same convention as PlaceholderEmailAdapter).
 *
 * @implements {SummarizerAdapter}
 */
export class PlaceholderLlmSummarizer {
  constructor() {
    this.name = "llm-summarizer-adapter-boundary";
    this.generationMode = "llm";
  }

  /** @returns {Promise<never>} */
  async summarize() {
    throw new Error(
      "LLM summarizer is not configured in this build (PlaceholderLlmSummarizer).",
    );
  }
}

/**
 * Summarize a user's live saved items. Deterministic-first: defaults to
 * DeterministicSummarizer so the capability always works with no model.
 * Reuses listItems (user-scoped, deletedAt-filtered) and recordAuditEvent
 * AS-IS.
 *
 * `itemCount` is always derived from the real `items` array returned by
 * listItems — never from the adapter's output — so the audited (and
 * returned) count can never drift from the user's true live-item count,
 * regardless of adapter behaviour.
 *
 * No audit event is recorded unless a summary is actually produced: with
 * PlaceholderLlmSummarizer the throw happens before recordAuditEvent is
 * called, so a failed/never-happened summarization can never be recorded
 * as one.
 *
 * @param {string} userId
 * @param {SummarizerAdapter} [adapter]  Defaults to a new
 *        DeterministicSummarizer. Injectable seam.
 * @returns {Promise<{ itemCount:number, text:string, snippet:string|null, generationMode:"deterministic"|"llm" }>}
 *          Resolves only when the adapter actually produces a summary —
 *          UNREACHABLE with PlaceholderLlmSummarizer in this build.
 * @throws {TypeError} on missing/empty userId (before listItems, the
 *         adapter call, or any audit event).
 * @throws {Error} from adapter.summarize — always, with
 *         PlaceholderLlmSummarizer, in this build.
 */
export async function summarizeItems(userId, adapter = new DeterministicSummarizer()) {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TypeError("userId required");
  }

  const items = listItems(userId);
  const itemCount = items.length;

  const { text, snippet } = await adapter.summarize(items);

  recordAuditEvent(userId, "items.summarized", {
    itemCount,
    generationMode: adapter.generationMode,
  });

  return { itemCount, text, snippet, generationMode: adapter.generationMode };
}

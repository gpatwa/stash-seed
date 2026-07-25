import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addItem,
  listItems,
  softDeleteItem,
  _reset as resetItems,
} from "../src/services/savedItems.js";
import { listAuditEvents, _reset as resetAudit } from "../src/services/audit.js";
import {
  summarizeItems,
  DeterministicSummarizer,
  PlaceholderLlmSummarizer,
} from "../src/services/summary.js";

// ── DeterministicSummarizer / summarizeItems — happy paths ─────────────────

test("summarizeItems: deterministic default, zero items — true count, no snippet", async () => {
  resetItems();
  resetAudit();

  const result = await summarizeItems("u1");

  assert.equal(result.itemCount, 0);
  assert.equal(result.itemCount, listItems("u1").length);
  assert.equal(result.snippet, null);
  assert.equal(result.generationMode, "deterministic");
  assert.match(result.text, /no saved items/i);
});

test("summarizeItems: deterministic default with items — true count and snippet", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "first item content");
  addItem("u1", "second and most recent item content");

  const result = await summarizeItems("u1");
  const live = listItems("u1");
  const mostRecent = live[live.length - 1];

  assert.equal(result.itemCount, 2);
  assert.equal(result.itemCount, live.length);
  assert.ok(result.snippet !== null);
  assert.ok(
    mostRecent.content.includes(result.snippet),
    "snippet must be a substring of the real most-recent item's content",
  );
  assert.ok(
    result.text.includes(String(result.itemCount)),
    "text must state the true count",
  );
  assert.ok(
    result.text.includes(result.snippet),
    "text must include the same snippet field that was returned",
  );
  assert.equal(result.generationMode, "deterministic");
});

test("summarizeItems: long content is truncated but the snippet remains a true substring", async () => {
  resetItems();
  resetAudit();
  const long = "a".repeat(500);
  addItem("u1", long);

  const result = await summarizeItems("u1");

  assert.ok(long.includes(result.snippet), "snippet must be a substring of the real content");
  assert.ok(result.snippet.length < long.length, "snippet must be shorter than the full content");
});

test("summarizeItems: soft-deleted items are excluded from count, snippet, and text", async () => {
  resetItems();
  resetAudit();
  const a = addItem("u1", "will be deleted — must never appear in the summary");
  softDeleteItem("u1", a);

  const result = await summarizeItems("u1");

  assert.equal(result.itemCount, 0);
  assert.equal(result.snippet, null);
  assert.ok(!result.text.includes("will be deleted"));
});

test("DeterministicSummarizer: singular wording for exactly one item", async () => {
  const s = new DeterministicSummarizer();
  const result = await s.summarize([{ itemId: "x", content: "hello" }]);

  assert.match(result.text, /1 saved item\b/);
  assert.doesNotMatch(result.text, /1 saved items\b/);
  assert.equal(result.snippet, "hello");
});

test("DeterministicSummarizer: plural wording for multiple items", async () => {
  const s = new DeterministicSummarizer();
  const result = await s.summarize([
    { itemId: "a", content: "alpha" },
    { itemId: "b", content: "beta" },
  ]);

  assert.match(result.text, /2 saved items\b/);
});

// ── EVAL 1: no-invention — claimed count === listItems(userId).length ──────

test("EVAL — claimed itemCount always equals listItems(userId).length (no invention)", async () => {
  for (let n = 0; n <= 3; n++) {
    resetItems();
    resetAudit();
    for (let i = 0; i < n; i++) {
      addItem("u1", `content #${i}`);
    }

    const result = await summarizeItems("u1");

    assert.equal(
      result.itemCount,
      listItems("u1").length,
      `itemCount must match ground truth for n=${n}`,
    );
    assert.ok(
      result.text.includes(String(n)) || n === 0,
      `text must state the true count for n=${n}`,
    );
  }
});

// ── EVAL 2: any snippet in the summary is a substring of a real item ───────

test("EVAL — snippet is always a true substring of the actual most-recent item's content", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "older note about groceries");
  const lastId = addItem("u1", "newest note about the quarterly report");

  const result = await summarizeItems("u1");
  const live = listItems("u1");
  const trueMostRecent = live.find((i) => i.itemId === lastId);

  assert.ok(result.snippet !== null);
  assert.ok(
    trueMostRecent.content.includes(result.snippet),
    "snippet must be a verbatim substring of the real item content",
  );
  assert.ok(result.text.includes(result.snippet));
});

// ── EVAL 3: user-scoping — u2's items/content never appear in u1's summary ─

test("EVAL — user-scoping: u2's items and content never appear in u1's summary (and vice versa)", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "u1-only content AAA");
  addItem("u2", "u2-secret content BBB");
  addItem("u2", "u2-secret content CCC most recent");

  const u1Result = await summarizeItems("u1");
  assert.equal(u1Result.itemCount, 1);
  assert.ok(!u1Result.text.includes("BBB"));
  assert.ok(!u1Result.text.includes("CCC"));
  assert.ok(!u1Result.text.includes("u2-secret"));

  const u2Result = await summarizeItems("u2");
  assert.equal(u2Result.itemCount, 2);
  assert.ok(!u2Result.text.includes("AAA"));
  assert.ok(!u2Result.text.includes("u1-only"));
});

// ── EVAL 4: PlaceholderLlmSummarizer throws by default ─────────────────────

test("EVAL — PlaceholderLlmSummarizer.summarize() throws by default, naming itself", async () => {
  const adapter = new PlaceholderLlmSummarizer();

  assert.equal(adapter.generationMode, "llm");
  await assert.rejects(
    () => adapter.summarize([]),
    /LLM summarizer is not configured in this build \(PlaceholderLlmSummarizer\)/,
  );
});

// ── EVAL 5: audit event carries generationMode and itemCount, NO content ───

test("EVAL — items.summarized audit event carries {itemCount, generationMode}, never item content", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "very secret payload nobody should log");

  await summarizeItems("u1");

  const evt = listAuditEvents("u1").find((e) => e.type === "items.summarized");
  assert.ok(evt, "items.summarized event must exist");
  assert.equal(evt.metadata.itemCount, 1);
  assert.equal(evt.metadata.generationMode, "deterministic");
  assert.ok(!("content" in evt.metadata), "content must never appear in audit metadata");
  assert.ok(!("text" in evt.metadata), "summary text must never appear in audit metadata");
  assert.ok(!("snippet" in evt.metadata), "snippet must never appear in audit metadata");
  assert.ok(
    !JSON.stringify(evt.metadata).includes("secret payload"),
    "no item content anywhere in the audited metadata",
  );
});

test("EVAL — no items.summarized audit event is recorded when the placeholder throws", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "x");

  await assert.rejects(() => summarizeItems("u1", new PlaceholderLlmSummarizer()));

  const events = listAuditEvents("u1").filter((e) => e.type === "items.summarized");
  assert.equal(events.length, 0, "a failed/never-happened summary must not be audited as one");
});

// ── EVAL 6: differential — placeholder throws, default deterministic succeeds ─

test("EVAL — differential: PlaceholderLlmSummarizer adapter throws via summarizeItems; default (deterministic) succeeds", async () => {
  resetItems();
  resetAudit();
  addItem("u1", "some content");

  await assert.rejects(
    () => summarizeItems("u1", new PlaceholderLlmSummarizer()),
    /LLM summarizer is not configured in this build/,
  );

  const ok = await summarizeItems("u1"); // default adapter — no second argument
  assert.equal(ok.generationMode, "deterministic");
  assert.equal(ok.itemCount, 1);
  assert.ok(ok.text.length > 0);
});

// ── Guards ───────────────────────────────────────────────────────────────

test("summarizeItems: guard — missing/empty userId throws TypeError, no audit event", async () => {
  resetItems();
  resetAudit();

  await assert.rejects(() => summarizeItems(""), TypeError);
  await assert.rejects(() => summarizeItems(null), TypeError);
  await assert.rejects(() => summarizeItems(undefined), TypeError);
  assert.equal(listAuditEvents("u1").length, 0);
});

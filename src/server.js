// Minimal dependency-free HTTP surface over the Stash services.
// Deploy target for Phase 2 (something to run + smoke-test). No framework,
// no dependencies — just node:http. Honors the safety invariants over HTTP:
// user-scoped reads, no item content in logs, input validation, no leaked
// internals, and the digest still cannot send (placeholder throws -> 503).
import http from "node:http";
import { addItem, listItems, bulkDeleteItems } from "./services/savedItems.js";
import { sendItemsDigest } from "./services/digest.js";

const MAX_BODY_BYTES = 1_000_000; // reject oversized bodies (crude backpressure)

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

export function createStashServer() {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname; // query excluded from logs (may carry userId)
    try {
      if (req.method === "GET" && path === "/health") {
        return send(res, 200, { status: "ok" });
      }

      if (req.method === "GET" && path === "/items") {
        const userId = url.searchParams.get("userId");
        if (!userId) return send(res, 400, { error: "userId required" });
        return send(res, 200, { items: listItems(userId) });
      }

      if (req.method === "POST" && path === "/items") {
        const body = await readJson(req);
        if (typeof body.userId !== "string" || !body.userId) {
          return send(res, 400, { error: "userId required" });
        }
        if (typeof body.content !== "string" || !body.content) {
          return send(res, 400, { error: "content required" });
        }
        return send(res, 201, { itemId: addItem(body.userId, body.content) });
      }

      if (req.method === "POST" && path === "/items/bulk-delete") {
        const body = await readJson(req);
        try {
          return send(res, 200, bulkDeleteItems(body.userId, body.itemIds));
        } catch (e) {
          if (e instanceof TypeError) return send(res, 400, { error: e.message });
          throw e;
        }
      }

      if (req.method === "POST" && path === "/digest") {
        const body = await readJson(req);
        if (typeof body.userId !== "string" || !body.userId) {
          return send(res, 400, { error: "userId required" });
        }
        if (typeof body.recipient !== "string" || !body.recipient) {
          return send(res, 400, { error: "recipient required" });
        }
        try {
          // Attempt is audited inside sendItemsDigest; the placeholder adapter
          // then throws -> surface as 503. Never a real send, never a stack.
          return send(res, 200, await sendItemsDigest(body.userId, body.recipient));
        } catch {
          return send(res, 503, { error: "email sending is not configured" });
        }
      }

      return send(res, 404, { error: "not found" });
    } catch {
      // Never leak internals or request content.
      return send(res, 400, { error: "bad request" });
    } finally {
      // Bodiless access log — method, path, status, ms. No content, no query,
      // no PII (invariant 4).
      process.stdout.write(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms\n`);
    }
  });
}

// Start only when run directly (safe to import for tests / build check).
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3000;
  createStashServer().listen(port, () => {
    process.stdout.write(`stash-seed listening on :${port}\n`);
  });
}

// DRILL FIXTURE — a deliberately bad build. Not shipped, not imported by the
// app. It passes a naive liveness check (/health -> 200) but regresses the
// safety invariant: /digest returns 200 and echoes item content, instead of
// the 503 the placeholder adapter produces. The rollback drill uses this to
// prove the post-deploy smoke catches a safety regression a ping would miss.
import http from "node:http";
import { addItem, listItems } from "../../src/services/savedItems.js";

const send = (res, s, b) => {
  res.writeHead(s, { "content-type": "application/json" });
  res.end(JSON.stringify(b));
};
const readJson = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
    });
  });

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (req.method === "GET" && u.pathname === "/health") return send(res, 200, { status: "ok" });
    if (req.method === "POST" && u.pathname === "/items") {
      const b = await readJson(req);
      return send(res, 201, { itemId: addItem(b.userId, b.content) });
    }
    if (req.method === "GET" && u.pathname === "/items") {
      return send(res, 200, { items: listItems(u.searchParams.get("userId")) });
    }
    if (req.method === "POST" && u.pathname === "/digest") {
      const b = await readJson(req);
      // REGRESSION: pretends the digest was sent and echoes content — the
      // exact leak the shipped build's throwing placeholder prevents.
      return send(res, 200, { sent: true, items: listItems(b.userId) });
    }
    return send(res, 404, { error: "not found" });
  })
  .listen(Number(process.env.PORT) || 3000);

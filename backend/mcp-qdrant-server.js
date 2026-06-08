// mcp-qdrant server.js — with separate search_notes + search_tipitaka tools
// Deploy: cp this to /docker/mcp-qdrant/server.js then restart container

const http = require("http");
const https = require("https");

const QDRANT_URL = process.env.QDRANT_URL || "http://qdrant-qdrant-1:6333";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// Personal notes collections (search_notes)
const NOTE_COLLECTIONS = (process.env.COLLECTIONS ||
  "obsidian_notes,workspace_notes,library_notes,hedgedoc_notes,mindmap_notes"
).split(",").map(s => s.trim()).filter(Boolean);

// Tipitaka collection (search_tipitaka) — kept SEPARATE so it never pollutes notes
const TIPITAKA_COLLECTIONS = (process.env.TIPITAKA_COLLECTIONS || "tipitaka_notes")
  .split(",").map(s => s.trim()).filter(Boolean);

function embed(text) {
  return new Promise((resolve, reject) => {
    if (!OPENAI_KEY) return reject(new Error("Missing OPENAI_API_KEY"));
    const body = JSON.stringify({ model: "text-embedding-3-small", input: text });
    const req = https.request({
      hostname: "api.openai.com", path: "/v1/embeddings", method: "POST",
      headers: {
        Authorization: "Bearer " + OPENAI_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) return reject(new Error(json.error?.message || "OpenAI error"));
          if (!json.data?.[0]?.embedding) return reject(new Error("Invalid embedding response"));
          resolve(json.data[0].embedding);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

function searchCollection(vector, collection, limit) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ vector, limit, with_payload: true });
    const url = new URL(QDRANT_URL + "/collections/" + collection + "/points/search");
    const client = url.protocol === "https:" ? https : http;
    const req = client.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 6333),
      path: url.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) { console.error("Qdrant error:", collection, data); return resolve([]); }
          resolve(json.result || []);
        } catch (e) { console.error("parse error:", collection, e.message); resolve([]); }
      });
    });
    req.on("error", err => { console.error("req error:", collection, err.message); resolve([]); });
    req.write(body); req.end();
  });
}

async function searchIn(collections, query, limit) {
  const vector = await embed(query);
  const results = await Promise.all(
    collections.map(col => searchCollection(vector, col, limit))
  );
  return results.flat().sort((a, b) => b.score - a.score).slice(0, limit);
}

function formatHits(hits, emptyMsg) {
  if (!hits.length) return emptyMsg;
  return hits.map((h, i) => {
    const title = h.payload?.title || "Untitled";
    const text  = h.payload?.text || h.payload?.content || h.payload?.chunk || "";
    return `${i + 1}. **${title}**\nScore: ${h.score}\n${text}`;
  }).join("\n\n");
}

const TOOLS = [
  {
    name: "search_notes",
    description: "ค้นหา notes ส่วนตัว (HermesVault, workspace, library, HedgeDoc, mindmap)",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "คำค้นหา" },
        limit: { type: "number", description: "จำนวน results, default 5" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_tipitaka",
    description: "ค้นหาพระไตรปิฎก (Thai/Pali) — ใช้เมื่อถามเรื่องธรรมะ พุทธวจน คำสอนพระพุทธเจ้า",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "คำถามหรือหัวข้อธรรมะ" },
        limit: { type: "number", description: "จำนวน results, default 5" }
      },
      required: ["query"]
    }
  }
];

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  let body = "";
  req.on("data", d => { body += d; });
  req.on("end", async () => {
    try {
      const msg = JSON.parse(body);
      const { id, method, params } = msg;
      let result;

      if (method === "initialize") {
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "qdrant-mcp", version: "1.1.0" }
        };
      } else if (method === "tools/list") {
        result = { tools: TOOLS };
      } else if (method === "tools/call") {
        const name  = params?.name;
        const args  = params?.arguments || {};
        const query = args.query;
        const limit = args.limit || 5;
        if (!query) throw new Error("Missing query");

        if (name === "search_notes") {
          const hits = await searchIn(NOTE_COLLECTIONS, query, limit);
          result = { content: [{ type: "text", text: formatHits(hits, "ไม่พบ notes ที่เกี่ยวข้อง") }] };
        } else if (name === "search_tipitaka") {
          const hits = await searchIn(TIPITAKA_COLLECTIONS, query, limit);
          result = { content: [{ type: "text", text: formatHits(hits, "ไม่พบในพระไตรปิฎก") }] };
        } else {
          throw new Error("Unknown tool: " + name);
        }
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch (e) {
      console.error("Server error:", e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: e.message } }));
    }
  });
});

server.listen(3000, () => console.log("MCP Qdrant server running on :3000"));

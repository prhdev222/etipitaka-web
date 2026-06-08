# Qdrant Guide — E-Tipitaka & การเพิ่มข้อมูลในอนาคต

> สรุปวันที่ 2026-06-09 — ระบบ semantic search สำหรับ Hermes bot

---

## 1. ภาพรวมระบบ (Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│  VPS srv1118629 (Docker, network: hermes-agent-iwpx_default) │
│                                                               │
│  PocketBase (pb.uraree.com)      Qdrant (172.16.1.7:6333)    │
│  ├─ data.db                      ├─ obsidian_notes            │
│  │  └─ tipitaka (raw table)      ├─ workspace_notes           │
│  │     129,147 rows              ├─ library_notes             │
│  │     (อ่านผ่าน API/hooks)       ├─ hedgedoc_notes            │
│  │                               ├─ mindmap_notes             │
│  │                               └─ tipitaka_notes ★          │
│  │                                  129,147 points            │
│  │                                                            │
│  mcp-qdrant (172.16.1.8:3000)    qdrant-indexer              │
│  ├─ tool: search_notes           └─ index notes (.md) only   │
│  └─ tool: search_tipitaka ★         upsert-only, ไม่ลบอะไร    │
│                                                               │
│  Hermes bot (Telegram) ──เรียก──> mcp-qdrant tools           │
└─────────────────────────────────────────────────────────────┘
```

★ = สิ่งที่เพิ่มวันนี้

---

## 2. สรุปสิ่งที่ทำวันนี้

### 2.1 Web App (E-Tipitaka)
- GitHub: https://github.com/prhdev222/etipitaka-web
- Frontend: React + TS + Tailwind (รอ deploy Cloudflare Pages)
- Backend: PocketBase v0.39 + JS hooks
- Data: 129,147 หน้า (thai/pali/thaimm/thaimc)
- API: `/api/tipitaka/{langs,search,read,compare,volumes}`

### 2.2 Qdrant Semantic Search
- สร้าง collection `tipitaka_notes` (1536 dim, Cosine, OpenAI text-embedding-3-small)
- embed ครบ 129,147 points (~49 นาที, ~$0.5)
- payload: `{title, text, lang, volume, page, items, source}`

### 2.3 MCP Server (ให้ bot ค้นได้)
- เพิ่ม tool `search_tipitaka` แยกจาก `search_notes` (ไม่ปนกัน)
- ไฟล์: `backend/mcp-qdrant-server.js` → deploy ที่ `/docker/mcp-qdrant/server.js`
- **ต้อง rebuild image** (`docker compose up -d --build`) เพราะ Dockerfile COPY server.js เข้า image

---

## 3. ค่า config สำคัญ (จำไว้ใช้)

| รายการ | ค่า |
|--------|-----|
| Qdrant URL (จาก host) | `http://172.16.1.7:6333` |
| Qdrant URL (จาก container) | `http://qdrant-qdrant-1:6333` |
| mcp-qdrant (จาก host) | `http://172.16.1.8:3000` |
| mcp-qdrant (จาก container) | `http://mcp-qdrant-mcp-qdrant-1:3000` |
| OpenAI key | อยู่ใน `/docker/mcp-qdrant/.env` |
| Embedding model | `text-embedding-3-small` (1536 dim) |
| Distance | Cosine |
| PocketBase data.db | `/docker/pocketbase/data/data.db` |
| Repo บน VPS | `/opt/etipitaka` |
| venv | `/opt/etipitaka/venv` |

---

## 4. ✅ re-index ปลอดภัยกับ tipitaka ไหม?

**ปลอดภัย 100%** — `qdrant-indexer/index.py` ทำแค่:
- `collection_exists()` → check
- `create_collection()` → เฉพาะถ้ายังไม่มี
- `upsert()` → เพิ่ม/อัปเดต **ไม่มี delete/drop เลย**

re-indexer อ่านแค่ไฟล์ `.md` ใน vault → upsert เข้า collection ของ notes
→ ไม่รู้จัก/ไม่แตะ `tipitaka_notes` เลย

---

## 5. 📚 วิธีเพิ่มข้อมูลใหม่เข้า Qdrant (อนาคต)

### หลักการ
- **embed ครั้งเดียวพอ** — ข้อมูลคงที่ (พระไตรปิฎก/หนังสือ) ไม่ต้องทำซ้ำ
- ข้อมูลใหม่ → embed เฉพาะของใหม่ ไม่แตะของเก่า
- แต่ละแหล่ง = collection แยก (จัดการง่าย, search แยกได้)

### 5.1 เพิ่มหนังสือ PDF (เช่น พุทธธรรม ฉบับปรับขยาย)

```
PDF → แตกข้อความ (PyMuPDF) → แบ่ง chunk (~800 ตัวอักษร, overlap)
    → embed (text-embedding-3-small) → upsert เข้า collection ใหม่
```

**ขั้นตอน (เมื่อพร้อมทำ):**
1. สร้าง script `embed_pdf_to_qdrant.py` (ขอ Claude เขียนให้)
2. ใช้ PyMuPDF แตกข้อความ (ดีสุดสำหรับ PDF ภาษาไทย)
3. chunk + embed → collection เช่น `books_notes`
4. payload: `{title, text, book, page, source}`

**สิ่งที่ต้องระวัง — Thai PDF:**
- ภาษาไทยอาจแตกเพี้ยน (สระลอย, ไม่มีเว้นวรรค, ฟอนต์ฝัง)
- ต้องลองแตก 1-2 หน้าดูคุณภาพก่อน embed ทั้งเล่ม
- ถ้าเพี้ยนมาก อาจต้องใช้ OCR (Tesseract + tha) แทน

### 5.2 เพิ่ม tool ให้ bot ค้นหนังสือ

แก้ `/docker/mcp-qdrant/server.js`:
- เพิ่ม env `BOOKS_COLLECTIONS=books_notes`
- เพิ่ม tool `search_books` (copy pattern จาก `search_tipitaka`)
- rebuild: `docker compose up -d --build`

### 5.3 เพิ่มหลายเล่มใน collection เดียว

ใช้ payload field `book` แยกแต่ละเล่ม:
```json
{"title": "...", "text": "...", "book": "พุทธธรรม", "page": 42}
```
- เพิ่มเล่มใหม่ = embed เฉพาะเล่มนั้น append เข้า collection เดิม
- point id ต้องไม่ชนกัน (ใช้ offset หรือ hash ของ book+page)

---

## 6. 🔧 คำสั่งที่ใช้บ่อย

### เช็คจำนวน points ใน collection
```bash
curl -s http://172.16.1.7:6333/collections/tipitaka_notes | grep -o '"points_count":[0-9]*'
```

### ดู collections ทั้งหมด
```bash
curl -s http://172.16.1.7:6333/collections
```

### test MCP tool ตรงๆ (ไม่ผ่าน bot)
```bash
# สร้าง /tmp/req.json:
# {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_tipitaka","arguments":{"query":"สติปัฏฐาน","limit":2}}}
curl -s -X POST http://172.16.1.8:3000 --data-binary @/tmp/req.json
```

### deploy MCP server ใหม่ (หลังแก้ server.js)
```bash
cd /opt/etipitaka && git pull
cp /docker/mcp-qdrant/server.js /docker/mcp-qdrant/server.js.bak
cp backend/mcp-qdrant-server.js /docker/mcp-qdrant/server.js
cd /docker/mcp-qdrant && docker compose up -d --build   # ต้อง --build!
docker logs mcp-qdrant-mcp-qdrant-1 --tail 5            # ดู version
```

### รัน embed (มี resume + retry)
```bash
cd /opt/etipitaka && nohup bash run_embed.sh > /tmp/embed.log 2>&1 &
tail -f /tmp/embed.log
```

---

## 7. ⚠️ บทเรียนจากวันนี้ (กันพลาดซ้ำ)

| ปัญหา | สาเหตุ | วิธีกัน |
|-------|--------|--------|
| `Loaded 0 rows` | env `LANG` ชนกับ system locale | ใช้ชื่อ env เฉพาะ (`TIPITAKA_LANG`) |
| `data.d` (ตัว b หาย) | terminal ตัดบรรทัดตอน paste | export ทีละบรรทัด + `echo "[$VAR]"` เช็ค |
| `Method not found` | server.js เก่ายังรัน | `--build` ไม่ใช่ `--force-recreate` |
| `queryParam not defined` | PocketBase v0.39 API ใหม่ | ใช้ `e.request.url.query().get()` |
| rate limit / disconnect | OpenAI/Qdrant timeout | retry + backoff + throttle |
| command ยาวเพี้ยน | terminal wrap | เขียนเป็น script file (nano) |

---

## 8. งานที่ยังเหลือ (TODO)

- [ ] Deploy frontend → Cloudflare Pages (`VITE_API_URL=https://pb.uraree.com`)
- [ ] แก้ CORS ใน `cors.pb.js` ใส่ domain Cloudflare จริง
- [ ] เพิ่ม MCP server เข้า Hermes `config.yaml` (ให้ bot เรียก search_tipitaka ได้)
- [ ] เพิ่มหนังสือ PDF (พุทธธรรม ฉบับปรับขยาย + เล่มอื่น)

#!/usr/bin/env python3
"""
แตก PDF → chunk → embed → upsert เข้า Qdrant (collection books_notes)
payload ตรงกับ mcp-qdrant (อ่าน title + text)

Usage:
  OPENAI_API_KEY=sk-... QDRANT_URL=http://172.16.1.7:6333 \
  PDF=/path/book.pdf BOOK="พุทธธรรม ฉบับปรับขยาย" \
  venv/bin/python backend/embed_pdf_to_qdrant.py

Optional:
  COLLECTION=books_notes   (default)
  CHUNK=800                ตัวอักษรต่อ chunk (default)
  OVERLAP=100              ซ้อนกันกัน context ขาด (default)
  BATCH_SIZE=100
  DRY_RUN=1                ดูจำนวน chunk ไม่ embed จริง
"""
import os, sys, time, hashlib

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
QDRANT_URL     = os.environ.get("QDRANT_URL", "http://172.16.1.7:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")
PDF            = os.environ.get("PDF", "")
BOOK           = os.environ.get("BOOK", "")
COLLECTION     = os.environ.get("COLLECTION", "books_notes")
CHUNK          = int(os.environ.get("CHUNK", "800"))
OVERLAP        = int(os.environ.get("OVERLAP", "100"))
BATCH_SIZE     = int(os.environ.get("BATCH_SIZE", "100"))
DRY_RUN        = os.environ.get("DRY_RUN", "") == "1"

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM   = 1536

if not PDF or not os.path.exists(PDF):
    print(f"ERROR: PDF not found: {PDF}"); sys.exit(1)
if not BOOK:
    print("ERROR: set BOOK=ชื่อหนังสือ"); sys.exit(1)
if not OPENAI_API_KEY and not DRY_RUN:
    print("ERROR: set OPENAI_API_KEY"); sys.exit(1)

try:
    import fitz  # PyMuPDF
except ImportError:
    os.system(f"{sys.executable} -m pip install pymupdf -q")
    import fitz

# ── แตก + chunk ต่อหน้า (page number ติดไปด้วย เพื่ออ้างอิง) ─────────────────
doc = fitz.open(PDF)
print(f"PDF: {doc.page_count} pages — book: {BOOK}")

def chunk_text(text, size, overlap):
    text = " ".join(text.split())   # normalize whitespace
    if len(text) <= size:
        return [text] if text.strip() else []
    out, i = [], 0
    while i < len(text):
        out.append(text[i:i+size])
        i += size - overlap
    return out

records = []   # (page, chunk_index_on_page, text)
for pno in range(doc.page_count):
    t = doc[pno].get_text().strip()
    if len(t) < 20:
        continue
    for ci, ch in enumerate(chunk_text(t, CHUNK, OVERLAP)):
        if len(ch.strip()) >= 20:
            records.append((pno + 1, ci, ch))   # page 1-based

print(f"Total chunks: {len(records):,}")
if DRY_RUN:
    print("DRY_RUN — preview chunk แรกๆ:")
    for r in records[:2]:
        print(f"  [น.{r[0]}#{r[1]}] {r[2][:120]}...")
    print(f"\nประมาณค่า embed: ~${len(records)*400/1_000_000*0.02:.3f}")
    sys.exit(0)

# ── Qdrant + OpenAI ──────────────────────────────────────────────────────────
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

oai    = OpenAI(api_key=OPENAI_API_KEY)
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY or None, timeout=120)

if not qdrant.collection_exists(COLLECTION):
    qdrant.create_collection(COLLECTION,
        vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE))
    print(f"Created collection '{COLLECTION}'")

def stable_id(book, page, ci):
    h = hashlib.md5(f"{book}|{page}|{ci}".encode("utf-8")).hexdigest()
    return int(h[:15], 16)

def embed_batch(texts, retries=6):
    for a in range(retries):
        try:
            return [d.embedding for d in oai.embeddings.create(model=EMBED_MODEL, input=texts).data]
        except Exception as e:
            if "rate_limit" in str(e) or "429" in str(e):
                w = 2**a; print(f"\n  rate limit, wait {w}s...", flush=True); time.sleep(w); continue
            raise
    raise RuntimeError("embed failed")

def upsert_retry(points, retries=6):
    for a in range(retries):
        try:
            qdrant.upsert(collection_name=COLLECTION, points=points); return
        except Exception as e:
            w = 2**a; print(f"\n  qdrant err, retry {w}s: {str(e)[:40]}", flush=True); time.sleep(w)
    raise RuntimeError("upsert failed")

# resume: ถ้ามี points อยู่แล้ว ข้ามไปจุดนั้น (chunk index คงที่)
START = 0
try:
    existing = qdrant.get_collection(COLLECTION).points_count or 0
    # นับเฉพาะของ book นี้ไม่ได้ตรงๆ — ใช้ points_count รวมเป็น guide คร่าวๆ
    START = (existing // BATCH_SIZE) * BATCH_SIZE
except Exception:
    pass
if START > 0:
    print(f"Resuming from chunk {START:,}")

t0 = time.time(); done = START
for i in range(START, len(records), BATCH_SIZE):
    batch = records[i:i+BATCH_SIZE]
    texts = [r[2] for r in batch]
    vecs = embed_batch(texts)
    pts = []
    for (page, ci, text), vec in zip(batch, vecs):
        title = f"{BOOK} — น.{page}"
        pts.append(PointStruct(id=stable_id(BOOK, page, ci), vector=vec, payload={
            "title": title, "text": text,
            "book": BOOK, "page": page, "source": "book",
        }))
    upsert_retry(pts)
    done += len(batch)
    el = time.time()-t0; rate = (done-START)/el if el else 0
    eta = (len(records)-done)/rate/60 if rate else 0
    print(f"  {done:,}/{len(records):,}  {rate:.0f}/s  ETA {eta:.1f}min", flush=True)
    time.sleep(0.3)

print(f"\nDone! {len(records):,} chunks embedded into '{COLLECTION}'")
print(f"Collection points: {qdrant.get_collection(COLLECTION).points_count:,}")
print(f"\n>>> Next: เพิ่ม '{COLLECTION}' + tool search_books ใน mcp-qdrant")

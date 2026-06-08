#!/usr/bin/env python3
"""
Embed tipitaka content with OpenAI and upsert to Qdrant.
Payload matches mcp-qdrant server.js (reads `title` + `text`).

Usage:
  OPENAI_API_KEY=sk-... QDRANT_URL=http://172.16.1.7:6333 \
  DATA_DB=/docker/pocketbase/data/data.db \
  python3 embed_to_qdrant.py

Optional env:
  LANG=thai            embed only one edition (default: all)
  BATCH_SIZE=100       OpenAI batch size (default 100)
  MAX_CHARS=1500       chars of content to embed/store (default 1500)
"""

import os, sys, sqlite3, time

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
QDRANT_URL     = os.environ.get("QDRANT_URL", "http://172.16.1.7:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")
LANG_FILTER    = os.environ.get("TIPITAKA_LANG", "")
# guard against system $LANG collision (e.g. en_US.UTF-8)
if LANG_FILTER not in ("thai", "pali", "thaimm", "thaimc"):
    LANG_FILTER = ""
BATCH_SIZE     = int(os.environ.get("BATCH_SIZE", "100"))
MAX_CHARS      = int(os.environ.get("MAX_CHARS", "1500"))
DATA_DB        = os.environ.get("DATA_DB", "/docker/pocketbase/data/data.db")

COLLECTION  = "tipitaka_notes"   # matches *_notes naming; add to mcp-qdrant COLLECTIONS
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM   = 1536

LANG_LABEL = {
    "thai":   "ไทย ฉบับหลวง",
    "pali":   "บาลี สยามรัฐ",
    "thaimm": "ไทย มหามกุฏฯ",
    "thaimc": "ไทย มหาจุฬาฯ",
}

if not OPENAI_API_KEY:
    print("ERROR: set OPENAI_API_KEY env variable")
    sys.exit(1)

try:
    from openai import OpenAI
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams, PointStruct
except ImportError:
    print("Installing dependencies...")
    os.system("pip3 install openai qdrant-client -q")
    from openai import OpenAI
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams, PointStruct

oai    = OpenAI(api_key=OPENAI_API_KEY)
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY or None, timeout=120)

def upsert_retry(points, retries=6):
    for attempt in range(retries):
        try:
            qdrant.upsert(collection_name=COLLECTION, points=points)
            return
        except Exception as ex:
            wait = 2 ** attempt
            print(f"\n  qdrant error ({str(ex)[:50]}), retry in {wait}s...", flush=True)
            time.sleep(wait)
    raise RuntimeError("qdrant upsert failed after retries")

# ── Create collection ────────────────────────────────────────────────────────
existing = [c.name for c in qdrant.get_collections().collections]
if COLLECTION not in existing:
    qdrant.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
    )
    print(f"Created collection '{COLLECTION}' (1536, Cosine)")
else:
    print(f"Collection '{COLLECTION}' exists, will upsert")

# ── Load rows ────────────────────────────────────────────────────────────────
conn = sqlite3.connect(DATA_DB)
q = "SELECT lang, volume, page, items, content FROM tipitaka"
if LANG_FILTER:
    q += f" WHERE lang='{LANG_FILTER}'"
q += " ORDER BY lang, volume, page"
rows = conn.execute(q).fetchall()
conn.close()
print(f"Loaded {len(rows):,} rows  (model: {EMBED_MODEL}, max_chars: {MAX_CHARS})")

# ── Embed + upsert in batches ────────────────────────────────────────────────
def embed_batch(texts, retries=6):
    for attempt in range(retries):
        try:
            resp = oai.embeddings.create(model=EMBED_MODEL, input=texts)
            return [r.embedding for r in resp.data]
        except Exception as ex:
            msg = str(ex)
            if "rate_limit" in msg or "429" in msg:
                wait = 2 ** attempt   # 1,2,4,8,16,32s
                print(f"\n  rate limit, waiting {wait}s...", end="", flush=True)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("embed failed after retries")

t0 = time.time()
done = 0

# Resume: skip rows already embedded (point ids are sequential 0..N-1)
START_FROM = int(os.environ.get("START_FROM", "0"))
if START_FROM <= 0:
    try:
        existing_pts = qdrant.get_collection(COLLECTION).points_count or 0
        # rewind to batch boundary to be safe
        START_FROM = (existing_pts // BATCH_SIZE) * BATCH_SIZE
    except Exception:
        START_FROM = 0
if START_FROM > 0:
    print(f"Resuming from row {START_FROM:,} (skipping already-embedded)")
    done = START_FROM

for i in range(START_FROM, len(rows), BATCH_SIZE):
    batch = rows[i:i+BATCH_SIZE]
    texts, metas = [], []
    for lang, vol, pg, items, content in batch:
        body = (content or "")[:MAX_CHARS]
        label = LANG_LABEL.get(lang, lang)
        title = f"พระไตรปิฎก {label} เล่ม {vol} หน้า {pg}"
        if items:
            title += f" ข้อ {items}"
        # embed the dhamma text (content carries the meaning)
        texts.append(body if body.strip() else title)
        metas.append((lang, vol, pg, items or "", title, body))

    vectors = embed_batch(texts)

    points = []
    for j, (vec, (lang, vol, pg, items, title, body)) in enumerate(zip(vectors, metas)):
        points.append(PointStruct(
            id=i + j,                       # deterministic sequential id
            vector=vec,
            payload={
                "title":  title,            # bot reads this
                "text":   body,             # bot reads this
                "lang":   lang,
                "volume": vol,
                "page":   pg,
                "items":  items,
                "source": "tipitaka",
            }
        ))

    upsert_retry(points)
    done += len(batch)
    time.sleep(0.4)   # throttle to stay under 1M TPM

    el = time.time() - t0
    rate = done / el if el else 0
    eta = (len(rows) - done) / rate / 60 if rate else 0
    print(f"  {done:,}/{len(rows):,}  {rate:.0f}/s  ETA {eta:.1f}min", flush=True)

print(f"\nDone! {done:,} rows in {(time.time()-t0)/60:.1f} min")
print(f"Collection '{COLLECTION}': {qdrant.get_collection(COLLECTION).points_count:,} points")
print(f"\n>>> Next: add '{COLLECTION}' to COLLECTIONS in /docker/mcp-qdrant/.env and restart")

#!/usr/bin/env python3
"""
Embed tipitaka content with OpenAI and upsert to Qdrant.
Usage:
  OPENAI_API_KEY=sk-... QDRANT_URL=http://localhost:6333 python3 embed_to_qdrant.py

Optional:
  QDRANT_API_KEY=...   (if Qdrant needs auth)
  LANG=thai            (embed only one lang, default: all)
  BATCH_SIZE=100       (default: 100)
"""

import os, sys, sqlite3, time, json
from typing import List

# ── Config ──────────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
QDRANT_URL     = os.environ.get("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")
LANG_FILTER    = os.environ.get("LANG", "")        # empty = all langs
BATCH_SIZE     = int(os.environ.get("BATCH_SIZE", "100"))
COLLECTION     = "tipitaka"
EMBED_MODEL    = "text-embedding-3-small"
EMBED_DIM      = 1536
DATA_DB        = os.environ.get("DATA_DB", "/docker/pocketbase/data/data.db")

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
qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY or None)

# ── Create collection if not exists ─────────────────────────────────────────
existing = [c.name for c in qdrant.get_collections().collections]
if COLLECTION not in existing:
    qdrant.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
    )
    print(f"Created collection '{COLLECTION}'")
else:
    print(f"Collection '{COLLECTION}' already exists")

# ── Load data ────────────────────────────────────────────────────────────────
conn = sqlite3.connect(DATA_DB)
query = "SELECT id, lang, volume, page, items, content FROM tipitaka"
if LANG_FILTER:
    query += f" WHERE lang='{LANG_FILTER}'"
query += " ORDER BY lang, volume, page"

rows = conn.execute(query).fetchall()
conn.close()
print(f"Loaded {len(rows):,} rows to embed (model: {EMBED_MODEL})")

# Check already embedded
try:
    info = qdrant.get_collection(COLLECTION)
    already = info.points_count or 0
    print(f"Already in Qdrant: {already:,} points")
except:
    already = 0

# ── Embed in batches ─────────────────────────────────────────────────────────
def embed_batch(texts: List[str]) -> List[List[float]]:
    resp = oai.embeddings.create(model=EMBED_MODEL, input=texts)
    return [r.embedding for r in resp.data]

points_done = 0
t0 = time.time()

for i in range(0, len(rows), BATCH_SIZE):
    batch = rows[i:i+BATCH_SIZE]
    texts = []
    for row in batch:
        _, lang, vol, pg, items, content = row
        # Truncate content to ~500 chars for embedding
        text = f"ภาษา:{lang} เล่ม:{vol} หน้า:{pg}\n{(content or '')[:500]}"
        texts.append(text)

    vectors = embed_batch(texts)

    points = []
    for j, (row, vec) in enumerate(zip(batch, vectors)):
        rid, lang, vol, pg, items, content = row
        points.append(PointStruct(
            id=abs(hash(rid)) % (2**63),   # stable int id from string id
            vector=vec,
            payload={
                "lang":    lang,
                "volume":  vol,
                "page":    pg,
                "items":   items or "",
                "excerpt": (content or "")[:300],
            }
        ))

    qdrant.upsert(collection_name=COLLECTION, points=points)
    points_done += len(batch)

    elapsed = time.time() - t0
    rate = points_done / elapsed
    remaining = (len(rows) - points_done) / rate if rate > 0 else 0
    print(f"  {points_done:,}/{len(rows):,}  {rate:.0f} rows/s  ETA: {remaining/60:.1f}min", end="\r")

print(f"\nDone! {points_done:,} rows embedded in {(time.time()-t0)/60:.1f} min")
print(f"Qdrant collection '{COLLECTION}': {qdrant.get_collection(COLLECTION).points_count:,} points")

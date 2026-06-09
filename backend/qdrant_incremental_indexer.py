#!/usr/bin/env python3
"""
Incremental Qdrant indexer — drop-in replacement for qdrant-indexer/index.py

ต่างจากของเดิม:
  - id คงที่จาก path (ไม่ใช่ลำดับ glob) → แก้ไฟล์เดิม = update ทับ ไม่ใช่ add ซ้ำ
  - เก็บ content hash ใน payload → ไฟล์ไม่เปลี่ยน = skip (ไม่เรียก OpenAI)
  - ลบไฟล์ = ลบ point ที่ orphan ออกจาก Qdrant

Env (เหมือนเดิม):
  OPENAI_API_KEY, QDRANT_URL, COLLECTION, VAULT_PATH
Optional:
  GLOB_PATTERN=**/*.md   (default)
  DRY_RUN=1              (เช็คว่าจะทำอะไร ไม่ embed จริง)
"""

import os, glob, hashlib
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from dotenv import load_dotenv

load_dotenv()

client     = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
qdrant     = QdrantClient(url=os.environ["QDRANT_URL"])
COLLECTION = os.environ["COLLECTION"]
VAULT_PATH = os.environ["VAULT_PATH"]
PATTERN    = os.environ.get("GLOB_PATTERN", "**/*.md")
DRY_RUN    = os.environ.get("DRY_RUN", "") == "1"

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM   = 1536

def stable_id(path):
    """Deterministic int id from file path (same file → same id always)."""
    h = hashlib.md5(path.encode("utf-8")).hexdigest()
    return int(h[:15], 16)   # 60-bit, fits Qdrant uint

def content_hash(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()

# ── Ensure collection ────────────────────────────────────────────────────────
if not qdrant.collection_exists(COLLECTION):
    qdrant.create_collection(
        COLLECTION,
        vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
    )
    print(f"Created collection '{COLLECTION}'")

# ── Load existing point hashes from Qdrant (id → hash) ───────────────────────
existing = {}          # id -> hash
offset = None
while True:
    pts, offset = qdrant.scroll(
        collection_name=COLLECTION,
        limit=256, with_payload=True, with_vectors=False, offset=offset,
    )
    for p in pts:
        existing[p.id] = (p.payload or {}).get("hash", "")
    if offset is None:
        break
print(f"Existing points in Qdrant: {len(existing):,}")

# ── Scan files, decide add / update / skip ───────────────────────────────────
files = glob.glob(f"{VAULT_PATH}/{PATTERN}", recursive=True)
print(f"Found {len(files)} files in vault")

current_ids = set()
to_embed = []          # (id, path, title, text, hash)
n_skip = 0

for path in files:
    try:
        text = open(path, errors="ignore").read()
    except Exception as e:
        print(f"  READ ERROR {path}: {e}")
        continue
    if len(text.strip()) < 10:
        continue

    pid   = stable_id(path)
    chash = content_hash(text)
    current_ids.add(pid)

    if existing.get(pid) == chash:
        n_skip += 1                       # unchanged → skip
        continue

    title = os.path.basename(path).replace(".md", "")
    to_embed.append((pid, path, title, text, chash))

# ── Find orphans (file deleted) ──────────────────────────────────────────────
orphan_ids = [pid for pid in existing if pid not in current_ids]

print(f"  to embed (new/changed): {len(to_embed)}")
print(f"  unchanged (skipped):    {n_skip}")
print(f"  orphans to delete:      {len(orphan_ids)}")

if DRY_RUN:
    print("\nDRY_RUN — no changes made.")
    raise SystemExit(0)

# ── Embed + upsert changed/new ───────────────────────────────────────────────
points = []
for i, (pid, path, title, text, chash) in enumerate(to_embed):
    try:
        resp = client.embeddings.create(model=EMBED_MODEL, input=f"{title}\n{text}"[:8000])
        points.append(PointStruct(
            id=pid,
            vector=resp.data[0].embedding,
            payload={"path": path, "title": title, "text": text[:500], "hash": chash},
        ))
        print(f"  [{i+1}/{len(to_embed)}] {title}")
    except Exception as e:
        print(f"  EMBED ERROR {title}: {e}")

if points:
    qdrant.upsert(collection_name=COLLECTION, points=points)
    print(f"Upserted {len(points)} points")

# ── Delete orphans ───────────────────────────────────────────────────────────
if orphan_ids:
    qdrant.delete(collection_name=COLLECTION, points_selector=orphan_ids)
    print(f"Deleted {len(orphan_ids)} orphan points")

print(f"\nDone. embedded={len(points)}, skipped={n_skip}, deleted={len(orphan_ids)}")

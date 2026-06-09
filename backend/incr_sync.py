"""
incr_sync — reusable incremental Qdrant sync helper.

ใช้ได้ทั้ง file-based และ API-based indexer.
จัดการ add / update(edit) / skip(unchanged) / delete(orphan) อัตโนมัติ
ด้วย stable id (จาก key) + content hash.

ตัวอย่างใช้:
    from incr_sync import incremental_sync

    items = []   # list of (key, text_to_embed, payload_dict)
    for r in records:
        key  = r["id"]                       # อะไรก็ได้ที่ unique + คงที่ต่อ record
        text = build_text(r)                 # ข้อความที่จะ embed
        payload = {"title": ..., "text": ...[:500]}
        items.append((key, text, payload))

    incremental_sync(qdrant, client, COLLECTION, items)
"""

import hashlib
from qdrant_client.models import Distance, VectorParams, PointStruct

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM   = 1536


def stable_id(key: str) -> int:
    """int id คงที่จาก key (record เดิม → id เดิมเสมอ)."""
    return int(hashlib.md5(str(key).encode("utf-8")).hexdigest()[:15], 16)


def content_hash(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def incremental_sync(qdrant, openai_client, collection, items,
                     dry_run=False, embed_model=EMBED_MODEL):
    """
    items: list of (key, text, payload)
    คืน dict สรุป {embedded, skipped, deleted}
    """
    # ensure collection
    if not qdrant.collection_exists(collection):
        qdrant.create_collection(
            collection,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
        print(f"  Created collection '{collection}'")

    # load existing id -> hash
    existing = {}
    offset = None
    while True:
        pts, offset = qdrant.scroll(
            collection_name=collection, limit=256,
            with_payload=True, with_vectors=False, offset=offset,
        )
        for p in pts:
            existing[p.id] = (p.payload or {}).get("hash", "")
        if offset is None:
            break

    current_ids = set()
    to_embed = []
    n_skip = 0
    for key, text, payload in items:
        if not text or len(text.strip()) < 10:
            continue
        pid   = stable_id(key)
        chash = content_hash(text)
        current_ids.add(pid)
        if existing.get(pid) == chash:
            n_skip += 1
            continue
        to_embed.append((pid, text, payload, chash))

    orphan_ids = [pid for pid in existing if pid not in current_ids]

    print(f"  {collection}: embed={len(to_embed)} skip={n_skip} delete={len(orphan_ids)}")
    if dry_run:
        return {"embedded": 0, "skipped": n_skip, "deleted": 0}

    # embed + upsert
    points = []
    for i, (pid, text, payload, chash) in enumerate(to_embed):
        try:
            vec = openai_client.embeddings.create(
                model=embed_model, input=text[:8000]
            ).data[0].embedding
            payload = dict(payload)
            payload["hash"] = chash
            points.append(PointStruct(id=pid, vector=vec, payload=payload))
        except Exception as e:
            print(f"    EMBED ERROR ({payload.get('title','?')}): {e}")
    if points:
        qdrant.upsert(collection_name=collection, points=points)

    # delete orphans
    if orphan_ids:
        qdrant.delete(collection_name=collection, points_selector=orphan_ids)

    print(f"  done: embedded={len(points)} skipped={n_skip} deleted={len(orphan_ids)}")
    return {"embedded": len(points), "skipped": n_skip, "deleted": len(orphan_ids)}

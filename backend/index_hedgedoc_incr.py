#!/usr/bin/env python3
"""
index_hedgedoc.py — incremental version (ใช้ incr_sync helper)
hedgedoc_notes จาก HedgeDoc Postgres

key = nid (note UUID, คงที่ต่อ note)
"""
import os
from openai import OpenAI
from qdrant_client import QdrantClient
from dotenv import load_dotenv
from incr_sync import incremental_sync

load_dotenv()

HOST = os.environ.get("HEDGEDOC_DB_HOST")
if not HOST:
    print("HedgeDoc: skipped (set HEDGEDOC_DB_HOST in .env)")
    raise SystemExit(0)

import psycopg2

client     = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
qdrant     = QdrantClient(url=os.environ["QDRANT_URL"])
COLLECTION = "hedgedoc_notes"
DRY_RUN    = os.environ.get("DRY_RUN", "") == "1"

conn = psycopg2.connect(
    host=HOST,
    port=int(os.environ.get("HEDGEDOC_DB_PORT", "5432")),
    dbname=os.environ.get("HEDGEDOC_DB_NAME", "hedgedoc"),
    user=os.environ.get("HEDGEDOC_DB_USER", "hedgedoc"),
    password=os.environ.get("HEDGEDOC_DB_PASSWORD", ""),
)
cur = conn.cursor()
cur.execute('SELECT id, title, content FROM "Notes" ORDER BY "updatedAt" DESC')
rows = cur.fetchall()
print(f"HedgeDoc: {len(rows)} notes")

items = []
for nid, title, content in rows:
    body = content or ""
    text = f"{title or ''}\n{body}".strip()
    title_disp = (title or "").strip()
    if not title_disp and body.strip():
        title_disp = body.strip().splitlines()[0]
    title_disp = (title_disp or "Untitled")[:120]
    items.append((
        f"hedgedoc:{nid}",
        text,
        {"type": "hedgedoc", "path": f"hedgedoc/{nid}",
         "title": title_disp, "text": text[:500]},
    ))

cur.close()
conn.close()

incremental_sync(qdrant, client, COLLECTION, items, dry_run=DRY_RUN)

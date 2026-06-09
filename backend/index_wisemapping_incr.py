#!/usr/bin/env python3
"""
index_wisemapping.py — incremental version (ใช้ incr_sync helper)
mindmap_notes จาก WiseMapping Postgres

key = mid (mindmap id, คงที่ต่อ map)
"""
import os, io, re, html, zipfile
from openai import OpenAI
from qdrant_client import QdrantClient
from dotenv import load_dotenv
from incr_sync import incremental_sync

load_dotenv()

HOST = os.environ.get("WISEMAPPING_DB_HOST")
if not HOST:
    print("WiseMapping: skipped (set WISEMAPPING_DB_HOST in .env)")
    raise SystemExit(0)

import psycopg2

client     = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
qdrant     = QdrantClient(url=os.environ["QDRANT_URL"])
COLLECTION = "mindmap_notes"
DRY_RUN    = os.environ.get("DRY_RUN", "") == "1"

conn = psycopg2.connect(
    host=HOST,
    port=int(os.environ.get("WISEMAPPING_DB_PORT", "5432")),
    dbname=os.environ.get("WISEMAPPING_DB_NAME", "wisemapping"),
    user=os.environ.get("WISEMAPPING_DB_USER", "wisemapping"),
    password=os.environ.get("WISEMAPPING_DB_PASSWORD", ""),
)
cur = conn.cursor()
cur.execute("""
    SELECT m.id, m.title, m.description, x.xml
    FROM mindmap m JOIN mindmap_xml x ON m.id = x.mindmap_id
""")
rows = cur.fetchall()
print(f"WiseMapping: {len(rows)} maps")


def extract_nodes(xml_bytes):
    data = bytes(xml_bytes)
    if data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            name = "content" if "content" in z.namelist() else z.namelist()[0]
            content = z.read(name).decode("utf-8", errors="ignore")
    else:
        content = data.decode("utf-8", errors="ignore")
    return [html.unescape(t) for t in re.findall(r'text="([^"]*)"', content) if t.strip()]


items = []
for mid, title, desc, xmlb in rows:
    try:
        nodes = extract_nodes(xmlb)
    except Exception as e:
        print(f"[skip] map {mid}: {e}")
        continue
    text = "\n".join(filter(None, [title, desc, " > ".join(nodes)])).strip()
    items.append((
        f"mindmap:{mid}",
        text,
        {"type": "mindmap", "path": f"wisemapping/{mid}",
         "title": title or "Untitled", "text": text[:500]},
    ))

cur.close()
conn.close()

incremental_sync(qdrant, client, COLLECTION, items, dry_run=DRY_RUN)

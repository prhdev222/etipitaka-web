#!/usr/bin/env python3
"""
index_library.py — incremental version (ใช้ incr_sync helper)
library_notes = PocketBase books + R2 files (2 แหล่งรวม 1 collection)

key มี prefix กันชนกัน:
  "book:{id}"  สำหรับหนังสือ PocketBase
  "file:{key}" สำหรับไฟล์ R2
รวม items ทั้งหมดก่อน sync ครั้งเดียว → orphan delete ถูกต้อง
"""
import os, urllib.request, json
from openai import OpenAI
from qdrant_client import QdrantClient
from dotenv import load_dotenv
from incr_sync import incremental_sync

load_dotenv()

client        = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
qdrant        = QdrantClient(url=os.environ["QDRANT_URL"])
COLLECTION    = "library_notes"
PB_URL        = os.environ.get("PB_URL", "https://pb.uraree.com")
WORKSPACE_URL = "https://space.uraree.com"
BOT_KEY       = os.environ.get("BOT_API_KEY", "")
DRY_RUN       = os.environ.get("DRY_RUN", "") == "1"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    return json.loads(urllib.request.urlopen(req).read())


items = []   # (key, text, payload) — รวมทุกแหล่งก่อน sync

# 1) PocketBase books
try:
    books = fetch(f"{PB_URL}/api/collections/books/records?perPage=500").get("items", [])
    print(f"PocketBase: {len(books)} books")
    for b in books:
        text = "\n".join(filter(None, [
            b.get("title", ""), b.get("author", ""),
            b.get("category", ""), b.get("description", "")
        ]))
        if len(text.strip()) < 3:
            continue
        items.append((
            f"book:{b['id']}",
            text,
            {"type": "book", "path": f"library/book/{b['id']}",
             "title": b.get("title", "Untitled"), "text": text[:500]},
        ))
except Exception as e:
    print(f"books error: {e}")

# 2) R2 files
if BOT_KEY:
    try:
        files = fetch(f"{WORKSPACE_URL}/api/library",
                      {"Authorization": f"Bearer {BOT_KEY}"}).get("files", [])
        print(f"R2: {len(files)} files")
        for f in files:
            name = f.get("name") or f.get("key") or ""
            if not name:
                continue
            items.append((
                f"file:{f.get('key', name)}",
                name,
                {"type": "file", "path": f.get("key", name),
                 "title": name, "text": f"{name} ({f.get('type', 'file')})"},
            ))
    except Exception as e:
        print(f"R2 error: {e}")
else:
    print("R2: skipped (no BOT_API_KEY)")

incremental_sync(qdrant, client, COLLECTION, items, dry_run=DRY_RUN)

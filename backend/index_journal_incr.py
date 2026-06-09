#!/usr/bin/env python3
"""
index_journal.py — incremental version (ใช้ incr_sync helper)
research_notes จาก PocketBase ra_meetings

key = r['id'] (PocketBase record id, คงที่ต่อ record)
→ แก้ record = update ทับ / ลบ record = ลบ point / ไม่เปลี่ยน = skip
"""
import os, urllib.request, urllib.error, json
from openai import OpenAI
from qdrant_client import QdrantClient
from dotenv import load_dotenv
from incr_sync import incremental_sync

load_dotenv()

PB_URL   = (os.environ.get("PB_URL") or "").rstrip("/")
PB_TOKEN = os.environ.get("PB_TOKEN", "")
DRY_RUN  = os.environ.get("DRY_RUN", "") == "1"

if not PB_URL:
    print("ra_meetings: skipped (set PB_URL in .env)")
    raise SystemExit(0)

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
qdrant = QdrantClient(url=os.environ["QDRANT_URL"])
COLLECTION = "research_notes"


def fetch_pb(path):
    headers = {"User-Agent": "qdrant-indexer/2.0"}
    if PB_TOKEN:
        headers["Authorization"] = f"Bearer {PB_TOKEN}"
    req = urllib.request.Request(f"{PB_URL}{path}", headers=headers)
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


try:
    data = fetch_pb("/api/collections/ra_meetings/records?perPage=500&sort=-created")
except urllib.error.HTTPError as e:
    print(f"ra_meetings: HTTP {e.code} — check PB_URL/PB_TOKEN")
    raise SystemExit(1)

records = data.get("items", [])
print(f"PocketBase ra_meetings: {len(records)} records")

# Build items: (key, text_to_embed, payload)
items = []
for r in records:
    mode  = r.get("mode", "research")
    title = (r.get("title") or r.get("paper_title") or r.get("topic") or "Untitled").strip()
    text = "\n".join(p for p in [
        title, f"Mode: {mode}",
        r.get("topic", ""), r.get("paper_title", ""), r.get("question", ""),
        r.get("synthesis", ""), r.get("project_summary", ""),
    ] if p).strip()
    preview = (r.get("synthesis") or r.get("project_summary") or text).strip()
    items.append((
        r["id"],                              # ← stable key (record id)
        text,
        {"type": "research_meeting", "mode": mode,
         "path": f"research/{r['id']}", "title": title[:120], "text": preview[:500]},
    ))

incremental_sync(qdrant, client, COLLECTION, items, dry_run=DRY_RUN)

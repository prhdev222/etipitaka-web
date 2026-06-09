#!/usr/bin/env python3
"""
index_workspace.py — incremental version (ใช้ incr_sync helper)
workspace_notes จาก space.uraree.com /api/notes

key = note['id'] (คงที่ต่อ note)
"""
import os, urllib.request, json
from openai import OpenAI
from qdrant_client import QdrantClient
from dotenv import load_dotenv
from incr_sync import incremental_sync

load_dotenv()

client        = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
qdrant        = QdrantClient(url=os.environ["QDRANT_URL"])
COLLECTION    = "workspace_notes"
WORKSPACE_URL = "https://space.uraree.com/api/notes"
BOT_KEY       = os.environ["BOT_API_KEY"]
DRY_RUN       = os.environ.get("DRY_RUN", "") == "1"

req = urllib.request.Request(WORKSPACE_URL, headers={
    "Authorization": f"Bearer {BOT_KEY}",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
})
notes = json.loads(urllib.request.urlopen(req).read())
print(f"Found {len(notes)} workspace notes")

items = []
for note in notes:
    blocks_text = " ".join(b.get("content") or b.get("text") or "" for b in note.get("blocks", []))
    text = f"{note.get('title', 'Untitled')}\n{blocks_text}"
    items.append((
        note["id"],
        text,
        {"path": f"workspace/{note['id']}", "title": note.get("title", "Untitled"), "text": text[:500]},
    ))

incremental_sync(qdrant, client, COLLECTION, items, dry_run=DRY_RUN)

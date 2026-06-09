#!/usr/bin/env python3
"""
index.py — incremental version (ใช้ incr_sync helper)
HermesVault (.md files) → obsidian_notes

key = file path (คงที่ต่อไฟล์)
→ แก้ไฟล์ = update ทับ / ลบไฟล์ = ลบ point / ไม่เปลี่ยน = skip
"""
import os, glob
from openai import OpenAI
from qdrant_client import QdrantClient
from dotenv import load_dotenv
from incr_sync import incremental_sync

load_dotenv()

client     = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
qdrant     = QdrantClient(url=os.environ["QDRANT_URL"])
COLLECTION = os.environ.get("COLLECTION", "obsidian_notes")
VAULT_PATH = os.environ["VAULT_PATH"]
PATTERN    = os.environ.get("GLOB_PATTERN", "**/*.md")
DRY_RUN    = os.environ.get("DRY_RUN", "") == "1"

files = glob.glob(f"{VAULT_PATH}/{PATTERN}", recursive=True)
print(f"Found {len(files)} files in {VAULT_PATH}")

items = []
for path in files:
    try:
        text = open(path, errors="ignore").read()
    except Exception as e:
        print(f"  READ ERROR {path}: {e}")
        continue
    title = os.path.basename(path).replace(".md", "")
    items.append((
        path,                                 # ← stable key (file path)
        f"{title}\n{text}",
        {"path": path, "title": title, "text": text[:500]},
    ))

incremental_sync(qdrant, client, COLLECTION, items, dry_run=DRY_RUN)

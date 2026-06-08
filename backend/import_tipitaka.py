#!/usr/bin/env python3
"""Import Tipitaka data into PocketBase's SQLite before first run."""

import os, sys, sqlite3, secrets, time

BACKEND = os.path.dirname(os.path.abspath(__file__))
PB_DATA = os.path.join(BACKEND, "pb_data")
DATA_DB = os.path.join(PB_DATA, "data.db")
SRC_DIR = os.path.join(BACKEND, "tipitaka_dbs")

os.makedirs(PB_DATA, exist_ok=True)

conn = sqlite3.connect(DATA_DB)
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA synchronous=NORMAL")
conn.execute("PRAGMA cache_size=-64000")  # 64MB cache

conn.execute("""
CREATE TABLE IF NOT EXISTS tipitaka (
    id          TEXT PRIMARY KEY,
    lang        TEXT NOT NULL,
    volume      INTEGER NOT NULL,
    page        INTEGER NOT NULL,
    items       TEXT DEFAULT '',
    content     TEXT DEFAULT '',
    header      TEXT DEFAULT '',
    footer      TEXT DEFAULT '',
    display     TEXT DEFAULT '',
    volume_orig INTEGER DEFAULT 0
)
""")
conn.commit()

# Skip if already imported
count = conn.execute("SELECT COUNT(*) FROM tipitaka").fetchone()[0]
if count > 0:
    print(f"Already imported ({count:,} rows). Skipping.")
    conn.close()
    sys.exit(0)

def import_lang(lang, table, src_cols, build_row):
    db_path = os.path.join(SRC_DIR, f"{lang}.db")
    if not os.path.exists(db_path):
        print(f"  SKIP {lang}: file not found")
        return
    t0 = time.time()
    src = sqlite3.connect(db_path)
    rows = src.execute(f"SELECT {', '.join(src_cols)} FROM {table}").fetchall()
    src.close()
    data = [build_row(r) for r in rows]
    conn.executemany(
        "INSERT INTO tipitaka (id,lang,volume,page,items,content,header,footer,display,volume_orig) VALUES (?,?,?,?,?,?,?,?,?,?)",
        data
    )
    conn.commit()
    print(f"  {lang}: {len(data):,} rows  ({time.time()-t0:.1f}s)")

print("Importing Tipitaka data...")

import_lang("thai", "thai", ["volumn","page","items","content"],
    lambda r: (secrets.token_hex(8), "thai", int(r[0]), int(r[1]), r[2] or "", r[3] or "", "", "", "", 0))

import_lang("pali", "pali", ["volumn","page","items","content"],
    lambda r: (secrets.token_hex(8), "pali", int(r[0]), int(r[1]), r[2] or "", r[3] or "", "", "", "", 0))

import_lang("thaimm", "thaimm", ["volumn","volume_orig","page","items","content"],
    lambda r: (secrets.token_hex(8), "thaimm", int(r[0]), int(r[2]), r[3] or "", r[4] or "", "", "", "", int(r[1] or 0)))

import_lang("thaimc", "thaimc", ["volumn","page","items","content","header","footer","display"],
    lambda r: (secrets.token_hex(8), "thaimc", int(r[0]), int(r[1]), r[2] or "", r[3] or "", r[4] or "", r[5] or "", r[6] or "", 0))

print("Creating indexes...")
conn.execute("CREATE INDEX IF NOT EXISTS idx_tipitaka_search ON tipitaka(lang, volume, page)")
conn.execute("CREATE INDEX IF NOT EXISTS idx_tipitaka_lang ON tipitaka(lang)")
conn.commit()

# Tell PocketBase migration is already applied
conn.execute("CREATE TABLE IF NOT EXISTS _migrations (file TEXT PRIMARY KEY NOT NULL, applied INTEGER NOT NULL) WITHOUT ROWID")
conn.execute("INSERT OR REPLACE INTO _migrations VALUES (?,?)", ("1700000001_tipitaka.js", 1))
conn.commit()

total = conn.execute("SELECT COUNT(*) FROM tipitaka").fetchone()[0]
conn.close()
print(f"\nDone! Total: {total:,} rows imported.")

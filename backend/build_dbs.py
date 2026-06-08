#!/usr/bin/env python3
"""Build tipitaka SQLite databases from D-Tipitaka SQL dumps."""
import sqlite3, subprocess, os, sys

SRC = "/tmp/D-tipitaka/1.2"
DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tipitaka_dbs")
os.makedirs(DST, exist_ok=True)

def build(bz2, dst_lang):
    out = f"{DST}/{dst_lang}.db"
    if os.path.exists(out):
        print(f"  {dst_lang}.db already exists, skip")
        return
    print(f"  Building {dst_lang}.db ...", end=" ", flush=True)
    sql = subprocess.check_output(["bunzip2", "-c", f"{SRC}/{bz2}"]).decode("utf-8", "replace")
    src = sqlite3.connect(":memory:")
    src.executescript(sql)
    dst = sqlite3.connect(out)

    if dst_lang == "thai":
        dst.execute("CREATE TABLE thai (volumn TEXT, page TEXT, items TEXT, content TEXT)")
        rows = src.execute("SELECT volume, page, items, content FROM thai_royal").fetchall()
        dst.executemany("INSERT INTO thai VALUES(?,?,?,?)",
            [("%02d" % r[0], "%04d" % r[1], r[2] or "", r[3] or "") for r in rows])

    elif dst_lang == "pali":
        dst.execute("CREATE TABLE pali (volumn TEXT, page TEXT, items TEXT, content TEXT)")
        rows = src.execute("SELECT volume, page, items, content FROM pali_siam").fetchall()
        dst.executemany("INSERT INTO pali VALUES(?,?,?,?)",
            [("%02d" % r[0], "%04d" % r[1], r[2] or "", r[3] or "") for r in rows])

    elif dst_lang == "thaimm":
        dst.execute("CREATE TABLE thaimm (volumn TEXT, volume_orig TEXT, page TEXT, items TEXT, content TEXT)")
        rows = src.execute("SELECT volume, volumn_orig, page, items, content FROM thai_mbu").fetchall()
        dst.executemany("INSERT INTO thaimm VALUES(?,?,?,?,?)",
            [("%02d" % r[0], str(r[1] or 0), "%04d" % r[2], r[3] or "", r[4] or "") for r in rows])

    elif dst_lang == "thaimc":
        dst.execute("CREATE TABLE thaimc (volumn TEXT, page TEXT, items TEXT, content TEXT, header TEXT, footer TEXT, display TEXT)")
        rows = src.execute("SELECT volume, page, items, content, header, footer, display FROM thai_mcu").fetchall()
        dst.executemany("INSERT INTO thaimc VALUES(?,?,?,?,?,?,?)",
            [("%02d" % r[0], "%04d" % r[1], r[2] or "", r[3] or "", r[4] or "", r[5] or "", r[6] or "") for r in rows])

    dst.execute(f"CREATE INDEX idx ON {dst_lang}(volumn, page)")
    dst.commit()
    dst.close()
    src.close()
    print(f"{len(rows):,} rows")

print("Building Tipitaka databases...")
build("thai_royal.sql.bz2", "thai")
build("pali_siam.sql.bz2",  "pali")
build("thai_mbu.sql.bz2",   "thaimm")
build("thai_mcu.sql.bz2",   "thaimc")
print(f"\nDone! Files in: {DST}")

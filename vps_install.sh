#!/bin/bash
# ====================================================
# E-Tipitaka VPS Setup
# Run: bash vps_install.sh
# ====================================================
set -e

GITHUB_REPO="https://github.com/prhdev222/etipitaka-web.git"
APP_DIR="/opt/etipitaka"
PB_DIR="/opt/pocketbase"   # แก้ตาม path PocketBase ของคุณ

echo "=================================================="
echo "  E-Tipitaka VPS Setup"
echo "=================================================="

# 1. Clone repo
echo ""
echo "[1/5] Cloning from GitHub..."
if [ -d "$APP_DIR" ]; then
  cd $APP_DIR && git pull
else
  git clone $GITHUB_REPO $APP_DIR
fi

# 2. Build tipitaka databases from D-Tipitaka
echo ""
echo "[2/5] Building Tipitaka databases..."
cd /tmp
if [ ! -d "D-tipitaka" ]; then
  git clone https://github.com/kit119/D-tipitaka.git
fi

mkdir -p $APP_DIR/backend/tipitaka_dbs

python3 - << 'PYEOF'
import sqlite3, subprocess, os

SRC = "/tmp/D-tipitaka/1.2"
DST = "/opt/etipitaka/backend/tipitaka_dbs"
os.makedirs(DST, exist_ok=True)

def build(bz2, src_table, dst_lang, insert_fn):
    if os.path.exists(f"{DST}/{dst_lang}.db"):
        print(f"  {dst_lang}.db already exists, skipping")
        return
    print(f"  Building {dst_lang}.db ...")
    sql = subprocess.check_output(["bunzip2","-c",f"{SRC}/{bz2}"]).decode("utf-8","replace")
    src = sqlite3.connect(":memory:")
    src.executescript(sql)
    dst = sqlite3.connect(f"{DST}/{dst_lang}.db")
    insert_fn(src, dst, dst_lang)
    dst.commit(); dst.close(); src.close()

def insert_standard(src, dst, lang):
    src_tbl = "thai_royal" if lang=="thai" else "pali_siam"
    dst.execute(f"CREATE TABLE {lang} (volumn TEXT,page TEXT,items TEXT,content TEXT)")
    rows = src.execute(f"SELECT volume,page,items,content FROM {src_tbl}").fetchall()
    dst.executemany(f"INSERT INTO {lang} VALUES(?,?,?,?)",
        [("%02d"%r[0],"%04d"%r[1],r[2] or "",r[3] or "") for r in rows])
    dst.execute(f"CREATE INDEX idx ON {lang}(volumn,page)")
    print(f"    {len(rows):,} rows")

def insert_thaimm(src, dst, lang):
    dst.execute("CREATE TABLE thaimm (volumn TEXT,volume_orig TEXT,page TEXT,items TEXT,content TEXT)")
    rows = src.execute("SELECT volume,volumn_orig,page,items,content FROM thai_mbu").fetchall()
    dst.executemany("INSERT INTO thaimm VALUES(?,?,?,?,?)",
        [("%02d"%r[0],str(r[1] or 0),"%04d"%r[2],r[3] or "",r[4] or "") for r in rows])
    dst.execute("CREATE INDEX idx ON thaimm(volumn,page)")
    print(f"    {len(rows):,} rows")

def insert_thaimc(src, dst, lang):
    dst.execute("CREATE TABLE thaimc (volumn TEXT,page TEXT,items TEXT,content TEXT,header TEXT,footer TEXT,display TEXT)")
    rows = src.execute("SELECT volume,page,items,content,header,footer,display FROM thai_mcu").fetchall()
    dst.executemany("INSERT INTO thaimc VALUES(?,?,?,?,?,?,?)",
        [("%02d"%r[0],"%04d"%r[1],r[2] or "",r[3] or "",r[4] or "",r[5] or "",r[6] or "") for r in rows])
    dst.execute("CREATE INDEX idx ON thaimc(volumn,page)")
    print(f"    {len(rows):,} rows")

build("thai_royal.sql.bz2", "thai_royal", "thai",   insert_standard)
build("pali_siam.sql.bz2",  "pali_siam",  "pali",   insert_standard)
build("thai_mbu.sql.bz2",   "thai_mbu",   "thaimm", insert_thaimm)
build("thai_mcu.sql.bz2",   "thai_mcu",   "thaimc", insert_thaimc)
print("  All databases ready!")
PYEOF

# 3. Import data into PocketBase
echo ""
echo "[3/5] Importing data into PocketBase..."
# Update path in import script
sed "s|BACKEND = .*|BACKEND = \"$APP_DIR/backend\"|" \
    $APP_DIR/backend/import_tipitaka.py > /tmp/import_run.py
python3 /tmp/import_run.py

# 4. Copy hooks to PocketBase
echo ""
echo "[4/5] Installing hooks..."
mkdir -p $PB_DIR/pb_hooks
cp $APP_DIR/backend/pb_hooks/*.pb.js $PB_DIR/pb_hooks/
echo "  Hooks installed: $(ls $PB_DIR/pb_hooks/)"

# 5. Restart PocketBase
echo ""
echo "[5/5] Restarting PocketBase..."
if command -v systemctl &>/dev/null && systemctl is-active --quiet pocketbase 2>/dev/null; then
  systemctl restart pocketbase
  echo "  Restarted via systemctl"
elif command -v pm2 &>/dev/null; then
  pm2 restart pocketbase 2>/dev/null || echo "  PM2: service not found, start manually"
else
  echo "  Please restart PocketBase manually"
fi

echo ""
echo "=================================================="
echo "  Done! Visit https://pb.uraree.com/_/"
echo "  to verify hooks are loaded"
echo "=================================================="

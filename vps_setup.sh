#!/bin/bash
# Run this on your VPS (SSH in first)
# Assumes PocketBase is already running at pb.uraree.com
# and pb_data/ is at /opt/pocketbase/pb_data (adjust path below)

PB_DIR="/opt/pocketbase"   # ← แก้ path ตาม VPS ของคุณ

echo "=== Copy hooks & migration to VPS PocketBase ==="

# 1. Copy hooks
mkdir -p $PB_DIR/pb_hooks
cp backend/pb_hooks/tipitaka.pb.js $PB_DIR/pb_hooks/

# 2. Copy migration (marks itself as applied after import)
mkdir -p $PB_DIR/pb_migrations
cp backend/pb_migrations/1700000001_tipitaka.js $PB_DIR/pb_migrations/

# 3. Copy import script
cp backend/import_tipitaka.py $PB_DIR/

# 4. Copy tipitaka DB files (you need to have these ready)
mkdir -p $PB_DIR/tipitaka_dbs
echo ""
echo ">>> Copy your .db files to $PB_DIR/tipitaka_dbs/"
echo "    scp resources/*.db user@your-vps:$PB_DIR/tipitaka_dbs/"
echo ""

# 5. Run import
echo "Running data import..."
cd $PB_DIR && python3 import_tipitaka.py

# 6. Restart PocketBase to load new hooks
echo "Restarting PocketBase..."
systemctl restart pocketbase   # หรือ: pm2 restart pocketbase

echo "Done!"

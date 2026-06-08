#!/bin/bash
# Run this once on your VPS to set up everything
set -e

INSTALL_DIR="/opt/etipitaka"
PB_VERSION="0.22.20"

echo "=== E-Tipitaka Setup ==="

# 1. Install dir
mkdir -p $INSTALL_DIR/{tipitaka_dbs,pb_hooks,pb_migrations,pb_public}

# 2. Download PocketBase
if [ ! -f "$INSTALL_DIR/pocketbase" ]; then
  echo "Downloading PocketBase v$PB_VERSION..."
  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    PB_ARCH="amd64"
  elif [ "$ARCH" = "aarch64" ]; then
    PB_ARCH="arm64"
  else
    PB_ARCH="amd64"
  fi
  wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -O /tmp/pb.zip
  unzip -q /tmp/pb.zip pocketbase -d $INSTALL_DIR
  chmod +x $INSTALL_DIR/pocketbase
  rm /tmp/pb.zip
  echo "  PocketBase downloaded."
fi

# 3. Copy hooks + migrations
cp -r backend/pb_hooks/*      $INSTALL_DIR/pb_hooks/
cp -r backend/pb_migrations/* $INSTALL_DIR/pb_migrations/

# 4. Copy tipitaka databases
# (expects .db files to be in ./tipitaka_dbs/ relative to this script)
if ls tipitaka_dbs/*.db 1>/dev/null 2>&1; then
  cp tipitaka_dbs/*.db $INSTALL_DIR/tipitaka_dbs/
  echo "  Tipitaka databases copied."
else
  echo "  WARNING: No .db files found in ./tipitaka_dbs/"
  echo "  Copy thai.db, pali.db, thaimm.db, thaimc.db to ./tipitaka_dbs/ then re-run."
fi

# 5. Build frontend
echo "Building frontend..."
cd frontend && npm install && npm run build && cd ..
echo "  Frontend built to backend/pb_public/"
cp -r backend/pb_public/* $INSTALL_DIR/pb_public/

# 6. systemd service
cat > /etc/systemd/system/etipitaka.service << EOF
[Unit]
Description=E-Tipitaka PocketBase
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/pocketbase serve --http="0.0.0.0:8090"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable etipitaka
systemctl start etipitaka

echo ""
echo "=== Done! ==="
echo "PocketBase running at http://YOUR_VPS_IP:8090"
echo "Admin panel:         http://YOUR_VPS_IP:8090/_/"
echo ""
echo "First run will import all Tipitaka data (may take ~1-2 min)"

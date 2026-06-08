#!/bin/bash
# Run this to push code updates (no data re-import)
set -e

INSTALL_DIR="/opt/etipitaka"

echo "=== Deploying update ==="

# Rebuild frontend
cd frontend && npm run build && cd ..

# Copy files
cp -r backend/pb_public/*     $INSTALL_DIR/pb_public/
cp -r backend/pb_hooks/*      $INSTALL_DIR/pb_hooks/

# Restart
systemctl restart etipitaka
echo "Done. Site updated."

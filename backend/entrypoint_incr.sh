#!/bin/sh
set -e
echo "[reindex] HermesVault -> obsidian_notes (incremental)"
VAULT_PATH=/vault COLLECTION=obsidian_notes python index_incr.py
echo "[reindex] workspace API -> workspace_notes (incremental)"
python index_workspace_incr.py
echo "[reindex] library (PocketBase books + R2 files) -> library_notes (incremental)"
python index_library_incr.py
echo "[reindex] HedgeDoc -> hedgedoc_notes (incremental)"
python index_hedgedoc_incr.py
echo "[reindex] WiseMapping -> mindmap_notes (incremental)"
python index_wisemapping_incr.py
echo "[reindex] Research meetings (PocketBase) -> research_notes (incremental)"
python index_journal_incr.py
echo "[reindex] done"

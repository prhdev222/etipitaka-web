/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  db.newQuery(`
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
  `).execute()

  db.newQuery(`CREATE INDEX IF NOT EXISTS idx_tipitaka_search ON tipitaka(lang, volume, page)`).execute()
  db.newQuery(`CREATE INDEX IF NOT EXISTS idx_tipitaka_lang ON tipitaka(lang)`).execute()

  // thai
  db.newQuery(`ATTACH DATABASE './tipitaka_dbs/thai.db' AS src_thai`).execute()
  db.newQuery(`
    INSERT INTO tipitaka (id, lang, volume, page, items, content)
    SELECT lower(hex(randomblob(8))), 'thai',
           CAST(volumn AS INTEGER), CAST(page AS INTEGER), items, content
    FROM src_thai.thai
  `).execute()
  db.newQuery(`DETACH DATABASE src_thai`).execute()

  // pali
  db.newQuery(`ATTACH DATABASE './tipitaka_dbs/pali.db' AS src_pali`).execute()
  db.newQuery(`
    INSERT INTO tipitaka (id, lang, volume, page, items, content)
    SELECT lower(hex(randomblob(8))), 'pali',
           CAST(volumn AS INTEGER), CAST(page AS INTEGER), items, content
    FROM src_pali.pali
  `).execute()
  db.newQuery(`DETACH DATABASE src_pali`).execute()

  // thaimm
  db.newQuery(`ATTACH DATABASE './tipitaka_dbs/thaimm.db' AS src_thaimm`).execute()
  db.newQuery(`
    INSERT INTO tipitaka (id, lang, volume, page, items, content, volume_orig)
    SELECT lower(hex(randomblob(8))), 'thaimm',
           CAST(volumn AS INTEGER), CAST(page AS INTEGER),
           items, content, CAST(volume_orig AS INTEGER)
    FROM src_thaimm.thaimm
  `).execute()
  db.newQuery(`DETACH DATABASE src_thaimm`).execute()

  // thaimc
  db.newQuery(`ATTACH DATABASE './tipitaka_dbs/thaimc.db' AS src_thaimc`).execute()
  db.newQuery(`
    INSERT INTO tipitaka (id, lang, volume, page, items, content, header, footer, display)
    SELECT lower(hex(randomblob(8))), 'thaimc',
           CAST(volumn AS INTEGER), CAST(page AS INTEGER),
           items, content, header, footer, display
    FROM src_thaimc.thaimc
  `).execute()
  db.newQuery(`DETACH DATABASE src_thaimc`).execute()

}, (db) => {
  db.newQuery(`DROP TABLE IF EXISTS tipitaka`).execute()
})

/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/tipitaka/langs", function(c) {
  return c.json(200, [
    { id: "thai",   label: "ไทย (ฉบับหลวง)" },
    { id: "pali",   label: "บาลี (สยามรัฐ)" },
    { id: "thaimm", label: "ไทย (มหามกุฏฯ)" },
    { id: "thaimc", label: "ไทย (มหาจุฬาฯ)" },
  ])
})

routerAdd("GET", "/api/tipitaka/search", function(c) {
  try {
    var q    = (c.queryParam("q") || "").trim()
    var lang = c.queryParam("lang") || "thai"
    var p    = parseInt(c.queryParam("p") || "1", 10)
    if (p < 1) p = 1
    if (!q) return c.json(400, { error: "missing q" })

    var per    = 15
    var offset = (p - 1) * per
    var like   = "%" + q + "%"

    var countRow = new DynamicModel({ total: 0 })
    $app.db()
      .newQuery("SELECT COUNT(*) AS total FROM tipitaka WHERE lang={:lang} AND content LIKE {:like}")
      .bind({ lang: lang, like: like })
      .one(countRow)

    var rows = arrayOf(new DynamicModel({ volume: 0, page: 0, items: "", excerpt: "" }))
    $app.db()
      .newQuery("SELECT volume, page, items, substr(content, max(1, instr(content, {:q}) - 80), 300) AS excerpt FROM tipitaka WHERE lang = {:lang} AND content LIKE {:like} ORDER BY volume ASC, page ASC LIMIT {:per} OFFSET {:off}")
      .bind({ q: q, lang: lang, like: like, per: per, off: offset })
      .all(rows)

    var total = countRow.total
    return c.json(200, {
      query: q, lang: lang, page: p, perPage: per,
      total: total, pages: Math.ceil(total / per), results: rows
    })
  } catch(e) { return c.json(500, { error: String(e) }) }
})

routerAdd("GET", "/api/tipitaka/read", function(c) {
  try {
    var lang   = c.queryParam("lang") || "thai"
    var volume = parseInt(c.queryParam("vol")  || "1", 10)
    var page   = parseInt(c.queryParam("page") || "1", 10)

    var row = new DynamicModel({ volume:0, page:0, items:"", content:"", header:"", footer:"" })
    try {
      $app.db()
        .newQuery("SELECT volume, page, items, content, header, footer FROM tipitaka WHERE lang={:lang} AND volume={:vol} AND page={:page} LIMIT 1")
        .bind({ lang: lang, vol: volume, page: page })
        .one(row)
    } catch(_) { return c.json(404, { error: "page not found" }) }

    var maxRow = new DynamicModel({ max_page: 0 })
    $app.db()
      .newQuery("SELECT MAX(page) AS max_page FROM tipitaka WHERE lang={:lang} AND volume={:vol}")
      .bind({ lang: lang, vol: volume })
      .one(maxRow)

    var maxVols = { thai:45, pali:45, thaimm:91, thaimc:45 }
    return c.json(200, {
      lang: lang, volume: row.volume, page: row.page,
      maxPage: maxRow.max_page, maxVolume: maxVols[lang] || 45,
      items: row.items, content: row.content,
      header: row.header, footer: row.footer,
    })
  } catch(e) { return c.json(500, { error: String(e) }) }
})

routerAdd("GET", "/api/tipitaka/compare", function(c) {
  try {
    var vol   = parseInt(c.queryParam("vol")  || "1", 10)
    var page  = parseInt(c.queryParam("page") || "1", 10)
    var langs = (c.queryParam("langs") || "thai,pali").split(",").slice(0, 3)
    var results = {}

    for (var i = 0; i < langs.length; i++) {
      var lang = langs[i]
      var row = new DynamicModel({ content:"", items:"", header:"", footer:"" })
      try {
        $app.db()
          .newQuery("SELECT content, items, header, footer FROM tipitaka WHERE lang={:lang} AND volume={:vol} AND page={:page} LIMIT 1")
          .bind({ lang: lang, vol: vol, page: page })
          .one(row)
        results[lang] = { content: row.content, items: row.items, header: row.header, footer: row.footer }
      } catch(_) { results[lang] = null }
    }
    return c.json(200, { vol: vol, page: page, langs: langs, results: results })
  } catch(e) { return c.json(500, { error: String(e) }) }
})

routerAdd("GET", "/api/tipitaka/volumes", function(c) {
  try {
    var lang = c.queryParam("lang") || "thai"
    var rows = arrayOf(new DynamicModel({ volume: 0, max_page: 0 }))
    $app.db()
      .newQuery("SELECT volume, MAX(page) AS max_page FROM tipitaka WHERE lang={:lang} GROUP BY volume ORDER BY volume")
      .bind({ lang: lang })
      .all(rows)
    return c.json(200, { lang: lang, volumes: rows })
  } catch(e) { return c.json(500, { error: String(e) }) }
})

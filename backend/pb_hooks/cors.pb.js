/// <reference path="../pb_data/types.d.ts" />

// Allow Cloudflare Pages frontend to call PocketBase API
onBeforeBootstrap(function(e) {
  e.app.settings().meta.appName = "E-Tipitaka"
})

// Add CORS headers for /api/tipitaka/* routes
routerUse(function(next) {
  return function(c) {
    var origin = c.request().header.get("Origin") || ""
    var allowed = [
      "https://etipitaka.pages.dev",   // ← แก้เป็น domain Cloudflare Pages ของคุณ
      "https://tipitaka.uraree.com",   // ← custom domain (ถ้ามี)
      "http://localhost:5173",          // dev
      "http://localhost:3000",
    ]

    var isAllowed = false
    for (var i = 0; i < allowed.length; i++) {
      if (allowed[i] === origin) { isAllowed = true; break }
    }

    if (isAllowed) {
      c.response().header().set("Access-Control-Allow-Origin", origin)
      c.response().header().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      c.response().header().set("Access-Control-Allow-Headers", "Content-Type, Authorization")
    }

    if (c.request().method === "OPTIONS") {
      return c.noContent(204)
    }

    return next(c)
  }
})

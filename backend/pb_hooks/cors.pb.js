/// <reference path="../pb_data/types.d.ts" />

// CORS for Cloudflare Pages frontend
routerAdd("OPTIONS", "/api/tipitaka/*", function(c) {
  c.response().header().set("Access-Control-Allow-Origin", "*")
  c.response().header().set("Access-Control-Allow-Methods", "GET, OPTIONS")
  c.response().header().set("Access-Control-Allow-Headers", "Content-Type")
  return c.noContent(204)
})

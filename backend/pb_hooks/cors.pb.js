/// <reference path="../pb_data/types.d.ts" />

routerAdd("OPTIONS", "/api/tipitaka/*", function(e) {
  e.response.header().set("Access-Control-Allow-Origin", "*")
  e.response.header().set("Access-Control-Allow-Methods", "GET, OPTIONS")
  e.response.header().set("Access-Control-Allow-Headers", "Content-Type")
  return e.noContent(204)
})

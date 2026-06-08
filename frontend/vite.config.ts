import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev only: proxy /api → local PocketBase
    proxy: {
      "/api": "http://localhost:8090",
    },
  },
  build: {
    // Cloudflare Pages expects output in "dist"
    outDir: "dist",
    emptyOutDir: true,
  },
})

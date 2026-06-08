import { useState, useEffect, useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api, type Lang, type SearchResponse } from "../lib/api"

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const [langs, setLangs]   = useState<Lang[]>([])
  const [query, setQuery]   = useState(params.get("q") || "")
  const [lang, setLang]     = useState(params.get("lang") || "thai")
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState("")

  useEffect(() => { api.langs().then(setLangs) }, [])

  const search = useCallback(async (q: string, l: string, p = 1) => {
    if (!q.trim()) return
    setLoading(true); setError("")
    try {
      const res = await api.search(q, l, p)
      setResult(res)
      setParams({ q, lang: l, p: String(p) })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally { setLoading(false) }
  }, [setParams])

  useEffect(() => {
    const q = params.get("q"), l = params.get("lang") || "thai", p = parseInt(params.get("p") || "1")
    if (q) { setQuery(q); setLang(l); search(q, l, p) }
  }, []) // eslint-disable-line

  const hl = (text: string, q: string) => {
    if (!q) return text
    return text.replace(
      new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g"),
      `<mark class="bg-yellow-200 dark:bg-yellow-700 dark:text-white rounded px-0.5">$1</mark>`
    )
  }

  return (
    <div>
      {/* Search form */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-4 mb-4">
        <form onSubmit={(e) => { e.preventDefault(); search(query, lang) }} className="flex flex-col gap-3">
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาคำในพระไตรปิฎก..."
            autoFocus
            className="w-full border border-amber-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex gap-2">
            <select value={lang} onChange={(e) => setLang(e.target.value)}
              className="flex-1 border border-amber-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm">
              {langs.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <button type="submit" disabled={loading}
              className="bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-medium disabled:opacity-50 transition-colors text-sm whitespace-nowrap">
              {loading ? "..." : "ค้นหา"}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-xl p-3 mb-3 text-sm">{error}</div>
      )}

      {/* Stats */}
      {result && (
        <div className="text-xs text-amber-700 dark:text-amber-400 mb-3 px-1">
          พบ <strong>{result.total.toLocaleString()}</strong> หน้า — หน้า {result.page}/{result.pages}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-2.5">
          {result.results.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-10 text-center text-gray-400">ไม่พบผลลัพธ์</div>
          )}

          {result.results.map((r, i) => (
            <button key={i} onClick={() => navigate(`/read?lang=${lang}&vol=${r.volume}&page=${r.page}&q=${encodeURIComponent(query)}`)}
              className="w-full text-left bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 hover:shadow-md active:scale-[0.99] transition-all">
              {/* Header row */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  เล่ม {r.volume}  หน้า {r.page}
                </span>
                {r.items && (
                  <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    ข้อ {r.items}
                  </span>
                )}
              </div>
              {/* Excerpt */}
              <p className="content-text text-gray-700 dark:text-gray-300 text-left line-clamp-3"
                dangerouslySetInnerHTML={{ __html: "…" + hl(r.excerpt, result.query) + "…" }} />
              {/* Tap hint */}
              <div className="text-xs text-amber-500 dark:text-amber-600 mt-1.5">แตะเพื่ออ่าน →</div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {result && result.pages > 1 && (
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {Array.from({ length: Math.min(result.pages, 10) }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => search(result.query, result.lang, p)}
              className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                p === result.page
                  ? "bg-amber-700 dark:bg-amber-600 text-white"
                  : "bg-white dark:bg-gray-800 hover:bg-amber-100 dark:hover:bg-gray-700 text-amber-800 dark:text-amber-400"
              }`}>{p}</button>
          ))}
          {result.pages > 10 && <span className="self-center text-gray-400 text-sm">…{result.pages} หน้า</span>}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2.5 mt-2">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-amber-100 dark:bg-gray-700 rounded w-24 mb-3" />
              <div className="space-y-2">
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-full" />
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

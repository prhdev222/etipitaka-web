import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { api, type ReadResponse, type Lang } from "../lib/api"

export default function ReaderPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const [langs, setLangs]       = useState<Lang[]>([])
  const [lang, setLang]         = useState(params.get("lang") || "thai")
  const [vol, setVol]           = useState(parseInt(params.get("vol") || "1"))
  const [page, setPage]         = useState(parseInt(params.get("page") || "1"))
  const [data, setData]         = useState<ReadResponse | null>(null)
  const [loading, setLoading]   = useState(false)
  const [inputPage, setInputPage] = useState(String(page))
  const [fullscreen, setFullscreen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const searchQuery = params.get("q") || ""

  useEffect(() => { api.langs().then(setLangs) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setFullscreen(false); setDrawerOpen(false) }
      if (e.key === "ArrowRight" && data && !drawerOpen)
        page < data.maxPage ? load(lang, vol, page + 1) : load(lang, vol + 1, 1)
      if (e.key === "ArrowLeft" && !drawerOpen)
        page > 1 ? load(lang, vol, page - 1) : load(lang, vol - 1, 9999)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [data, lang, vol, page, drawerOpen]) // eslint-disable-line

  const load = useCallback(async (l: string, v: number, p: number) => {
    setLoading(true); setDrawerOpen(false)
    try {
      const res = await api.read(l, v, p)
      setData(res); setLang(l); setVol(v); setPage(p); setInputPage(String(p))
      navigate(`/read?lang=${l}&vol=${v}&page=${p}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`, { replace: true })
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [navigate, searchQuery])

  useEffect(() => { load(lang, vol, page) }, []) // eslint-disable-line

  const hl = (text: string) => {
    if (!searchQuery) return text
    return text.replace(
      new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g"),
      `<mark class="bg-yellow-200 dark:bg-yellow-700 dark:text-white rounded px-0.5">$1</mark>`
    )
  }
  const fmt = (t: string) => t.replace(/\n/g, "<br/>").replace(/\t/g, "&emsp;")

  // ── Shared nav buttons ───────────────────────────────────────────────────────
  const prevBtn = (cls = "") => (
    <button onClick={() => page > 1 ? load(lang, vol, page - 1) : load(lang, vol - 1, 9999)}
      disabled={vol === 1 && page === 1}
      className={`px-4 py-2 rounded-xl bg-amber-100 dark:bg-gray-700 hover:bg-amber-200 dark:hover:bg-gray-600 text-amber-800 dark:text-amber-300 disabled:opacity-30 transition-colors text-sm ${cls}`}>
      ← ก่อนหน้า
    </button>
  )
  const nextBtn = (cls = "") => (
    <button onClick={() => data && page < data.maxPage ? load(lang, vol, page + 1) : load(lang, vol + 1, 1)}
      disabled={data ? (vol >= data.maxVolume && page >= data.maxPage) : false}
      className={`px-4 py-2 rounded-xl bg-amber-700 dark:bg-amber-600 hover:bg-amber-800 text-white disabled:opacity-30 transition-colors text-sm ${cls}`}>
      ถัดไป →
    </button>
  )

  // ── Content block ────────────────────────────────────────────────────────────
  const ContentBlock = () => (
    <>
      {loading && <div className="text-center text-amber-600 dark:text-amber-400 py-20">กำลังโหลด...</div>}
      {!loading && data && (
        <>
          {data.header && (
            <div className="text-center font-semibold text-amber-900 dark:text-amber-300 mb-4 content-text"
              dangerouslySetInnerHTML={{ __html: fmt(data.header) }} />
          )}
          <div className="content-text text-gray-800 dark:text-gray-200 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: hl(fmt(data.content)) }} />
          {data.footer && (
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-4 border-t dark:border-gray-700 pt-3"
              dangerouslySetInnerHTML={{ __html: fmt(data.footer) }} />
          )}
        </>
      )}
      {!loading && !data && (
        <div className="text-center text-gray-400 py-20">ไม่พบเนื้อหา</div>
      )}
    </>
  )

  // ── Sidebar controls ─────────────────────────────────────────────────────────
  const SidebarControls = () => (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">ฉบับ</label>
        <select value={lang} onChange={(e) => load(e.target.value, 1, 1)}
          className="w-full border border-amber-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
          {langs.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">เล่มที่</label>
          <input type="number" min={1} max={data?.maxVolume || 45} value={vol}
            onChange={(e) => { const v = parseInt(e.target.value); if (v > 0) load(lang, v, 1) }}
            className="w-full border border-amber-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
            หน้า {data ? `(1–${data.maxPage})` : ""}
          </label>
          <form onSubmit={(e) => { e.preventDefault(); load(lang, vol, parseInt(inputPage) || 1) }}>
            <input type="number" min={1} max={data?.maxPage || 9999} value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              className="w-full border border-amber-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </form>
        </div>
      </div>
      <button onClick={() => { navigate(`/compare?vol=${vol}&page=${page}`); setDrawerOpen(false) }}
        className="w-full text-sm text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded-lg py-1.5 hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors">
        ⚖️ เทียบฉบับ
      </button>
    </div>
  )

  // ── Page info badge ──────────────────────────────────────────────────────────
  const PageBadge = () => (
    <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
      เล่ม {vol} · หน้า {page}
      {data?.items && <span className="text-gray-400 text-xs ml-1">ข้อ {data.items}</span>}
    </span>
  )

  // ── FULLSCREEN ───────────────────────────────────────────────────────────────
  if (fullscreen) return (
    <div className="fixed inset-0 z-50 bg-amber-50 dark:bg-gray-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-900 border-b border-amber-100 dark:border-gray-800 shrink-0">
        {prevBtn()}
        <div className="flex items-center gap-2">
          <PageBadge />
          <span className="hidden sm:inline text-xs text-gray-400">← → ESC</span>
        </div>
        <div className="flex gap-2">
          {nextBtn()}
          <button onClick={() => setFullscreen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 transition-colors text-sm">✕</button>
        </div>
      </div>
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6"><ContentBlock /></div>
      </div>
      <div className="shrink-0 grid grid-cols-2 gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-t border-amber-100 dark:border-gray-800">
        {prevBtn("w-full justify-center")}
        {nextBtn("w-full justify-center")}
      </div>
    </div>
  )

  // ── NORMAL VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col lg:flex-row gap-4">

      {/* Desktop sidebar */}
      <div className="hidden lg:block lg:w-56 shrink-0">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-4 sticky top-16">
          <SidebarControls />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-50 dark:border-gray-700">
            {prevBtn()}
            <div className="flex items-center gap-2">
              <PageBadge />
              {/* Mobile: settings drawer button */}
              <button onClick={() => setDrawerOpen(true)}
                className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50 dark:bg-gray-700 hover:bg-amber-100 dark:hover:bg-gray-600 text-amber-600 dark:text-amber-400 transition-colors text-sm"
                title="ตั้งค่า">☰</button>
              {/* Fullscreen */}
              <button onClick={() => setFullscreen(true)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50 dark:bg-gray-700 hover:bg-amber-100 dark:hover:bg-gray-600 text-amber-600 dark:text-amber-400 transition-colors"
                title="เต็มหน้าจอ">⛶</button>
            </div>
            {nextBtn()}
          </div>

          {/* Text */}
          <div className="px-4 sm:px-6 py-5">
            <ContentBlock />
          </div>

          {/* Bottom nav (mobile duplicate for long pages) */}
          <div className="flex gap-3 px-4 py-3 border-t border-amber-50 dark:border-gray-700">
            {prevBtn("flex-1 justify-center")}
            {nextBtn("flex-1 justify-center")}
          </div>
        </div>
      </div>

      {/* ── Mobile drawer (bottom sheet) ─────────────────────────── */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setDrawerOpen(false)} />
          {/* Sheet */}
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl p-5 pb-8 animate-slide-up">
            <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mb-4" />
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">ตั้งค่าการอ่าน</h3>
            <SidebarControls />
          </div>
        </>
      )}
    </div>
  )
}

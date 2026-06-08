import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { api, type CompareResponse } from "../lib/api"

const ALL_LANGS = [
  { id: "thai",   label: "ไทย (ฉบับหลวง)" },
  { id: "pali",   label: "บาลี (สยามรัฐ)" },
  { id: "thaimm", label: "ไทย (มหามกุฏฯ)" },
  { id: "thaimc", label: "ไทย (มหาจุฬาฯ)" },
]

export default function ComparePage() {
  const [params] = useSearchParams()
  const [vol, setVol]         = useState(parseInt(params.get("vol") || "1"))
  const [page, setPage]       = useState(parseInt(params.get("page") || "1"))
  const [selected, setSelected] = useState(["thai", "pali"])
  const [activeTab, setActiveTab] = useState("thai")   // mobile: which col to show
  const [data, setData]       = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (v: number, p: number, langs: string[]) => {
    setLoading(true)
    try { setData(await api.compare(v, p, langs)) }
    catch { setData(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(vol, page, selected) }, []) // eslint-disable-line

  const toggleLang = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((l) => l !== id)
      : [...selected, id].slice(0, 3)
    if (next.length === 0) return
    setSelected(next)
    if (!next.includes(activeTab)) setActiveTab(next[0])
    load(vol, page, next)
  }
  const fmt = (t: string) => t.replace(/\n/g, "<br/>").replace(/\t/g, "&emsp;")

  const changePage = (delta: number) => {
    const p = Math.max(1, page + delta)
    setPage(p); load(vol, p, selected)
  }

  return (
    <div>
      {/* Controls card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-4 mb-4 space-y-3">
        {/* Vol + page */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">เล่มที่</label>
            <input type="number" min={1} max={91} value={vol}
              onChange={(e) => setVol(parseInt(e.target.value) || 1)}
              className="w-full border border-amber-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">หน้าที่</label>
            <input type="number" min={1} value={page}
              onChange={(e) => setPage(parseInt(e.target.value) || 1)}
              className="w-full border border-amber-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="flex items-end">
            <button onClick={() => load(vol, page, selected)}
              className="bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              โหลด
            </button>
          </div>
        </div>

        {/* Edition selector */}
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">เลือกฉบับ (สูงสุด 3)</p>
          <div className="flex flex-wrap gap-2">
            {ALL_LANGS.map((l) => (
              <button key={l.id} onClick={() => toggleLang(l.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  selected.includes(l.id)
                    ? "bg-amber-700 dark:bg-amber-600 text-white border-transparent"
                    : "border-amber-200 dark:border-gray-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-gray-700"
                }`}>{l.label}</button>
            ))}
          </div>
        </div>

        {/* Page nav */}
        <div className="flex gap-2 pt-1">
          <button onClick={() => changePage(-1)} disabled={page <= 1}
            className="flex-1 py-2 rounded-xl bg-amber-100 dark:bg-gray-700 hover:bg-amber-200 dark:hover:bg-gray-600 text-amber-800 dark:text-amber-300 disabled:opacity-30 text-sm font-medium transition-colors">
            ← ก่อนหน้า
          </button>
          <button onClick={() => changePage(1)}
            className="flex-1 py-2 rounded-xl bg-amber-700 dark:bg-amber-600 hover:bg-amber-800 text-white text-sm font-medium transition-colors">
            ถัดไป →
          </button>
        </div>
      </div>

      {loading && <div className="text-center text-amber-600 dark:text-amber-400 py-16">กำลังโหลด...</div>}

      {!loading && data && (
        <>
          {/* Mobile: tab switcher */}
          <div className="sm:hidden flex border-b border-amber-100 dark:border-gray-700 mb-3 bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm">
            {selected.map((id) => {
              const info = ALL_LANGS.find((l) => l.id === id)
              return (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                    activeTab === id
                      ? "bg-amber-700 dark:bg-amber-600 text-white"
                      : "text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-gray-700"
                  }`}>
                  {info?.label.split("(")[0].trim()}
                </button>
              )
            })}
          </div>

          {/* Desktop: columns  |  Mobile: single active tab */}
          <div className={`hidden sm:grid gap-4 ${selected.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {selected.map((langId) => {
              const info = ALL_LANGS.find((l) => l.id === langId)
              const c = data.results[langId]
              return (
                <div key={langId} className="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                  <div className="font-semibold text-amber-800 dark:text-amber-400 mb-3 pb-2 border-b border-amber-100 dark:border-gray-700 text-sm">
                    {info?.label}
                  </div>
                  {c
                    ? <>
                        {c.header && <div className="text-center font-semibold text-amber-900 dark:text-amber-300 mb-2 content-text" dangerouslySetInnerHTML={{ __html: fmt(c.header) }} />}
                        <div className="content-text text-gray-800 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: fmt(c.content) }} />
                      </>
                    : <div className="text-gray-400 text-sm text-center py-8">ไม่พบเนื้อหา</div>
                  }
                </div>
              )
            })}
          </div>

          {/* Mobile single column */}
          <div className="sm:hidden">
            {selected.filter(id => id === activeTab).map((langId) => {
              const c = data.results[langId]
              return (
                <div key={langId} className="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                  {c
                    ? <>
                        {c.header && <div className="text-center font-semibold text-amber-900 dark:text-amber-300 mb-3 content-text" dangerouslySetInnerHTML={{ __html: fmt(c.header) }} />}
                        <div className="content-text text-gray-800 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: fmt(c.content) }} />
                      </>
                    : <div className="text-gray-400 text-sm text-center py-8">ไม่พบเนื้อหา</div>
                  }
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

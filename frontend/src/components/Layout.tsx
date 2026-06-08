import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"

type Theme    = "light" | "dark"
type FontSize = "sm" | "md" | "lg" | "xl"

const FONT_PX: Record<FontSize, string> = {
  sm: "14px", md: "16px", lg: "19px", xl: "22px",
}

const NAV = [
  { path: "/search",  label: "ค้นหา",  icon: "🔍" },
  { path: "/read",    label: "อ่าน",   icon: "📖" },
  { path: "/compare", label: "เทียบ",  icon: "⚖️" },
]

const SIZES: { key: FontSize; label: string }[] = [
  { key: "sm", label: "ก" },
  { key: "md", label: "ก" },
  { key: "lg", label: "ก" },
  { key: "xl", label: "ก" },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme") as Theme
    return saved || "light"
  })

  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const saved = localStorage.getItem("fontSize") as FontSize
    return saved || "md"
  })

  // Sync font size to CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty("--content-font", FONT_PX[fontSize])
    localStorage.setItem("fontSize", fontSize)
  }, [fontSize])

  // Toggle: manipulate DOM directly — no waiting for useEffect
  const toggleTheme = () => {
    const next: Theme = theme === "light" ? "dark" : "light"
    document.documentElement.classList.toggle("dark", next === "dark")
    localStorage.setItem("theme", next)
    setTheme(next)
  }

  return (
    <div className="min-h-screen bg-amber-50 dark:bg-gray-950 font-thai transition-colors duration-200">

      {/* ── Top Header ──────────────────────────────────────────────── */}
      <header className="bg-amber-800 dark:bg-gray-900 text-amber-50 shadow-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center gap-3">

          <Link to="/search" className="text-base font-semibold shrink-0 mr-1">
            🪷 <span className="hidden sm:inline">E-Tipitaka</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex gap-1">
            {NAV.map((n) => (
              <Link key={n.path} to={n.path}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  pathname.startsWith(n.path)
                    ? "bg-amber-50 text-amber-900 font-medium"
                    : "hover:bg-amber-700 dark:hover:bg-gray-700"
                }`}>
                {n.icon} {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">

            {/* Font size */}
            <div className="flex items-center bg-amber-700/60 dark:bg-gray-700 rounded-lg overflow-hidden">
              {SIZES.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => setFontSize(s.key)}
                  className={`px-2 sm:px-2.5 py-1.5 transition-colors ${
                    fontSize === s.key
                      ? "bg-amber-50 text-amber-900 font-semibold"
                      : "hover:bg-amber-600 dark:hover:bg-gray-600 text-amber-50"
                  }`}
                  style={{ fontSize: `${11 + i * 2}px` }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Dark / Light toggle */}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-700/60 dark:bg-gray-700 hover:bg-amber-600 dark:hover:bg-gray-600 transition-colors text-base"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-20 sm:pb-6">
        {children}
      </main>

      {/* ── Mobile bottom nav ───────────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-gray-900 border-t border-amber-100 dark:border-gray-800 flex">
        {NAV.map((n) => (
          <Link key={n.path} to={n.path}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors ${
              pathname.startsWith(n.path)
                ? "text-amber-700 dark:text-amber-400 font-semibold"
                : "text-gray-400 dark:text-gray-500"
            }`}>
            <span className="text-xl leading-none">{n.icon}</span>
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>

    </div>
  )
}

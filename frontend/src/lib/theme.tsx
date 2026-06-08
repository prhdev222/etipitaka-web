import { useState, useEffect } from "react"

export type FontSize = "sm" | "md" | "lg" | "xl"
export type Theme = "light" | "dark"

export const FONT_PX: Record<FontSize, string> = {
  sm: "14px", md: "16px", lg: "19px", xl: "22px",
}

// ── Module-level store (no React context needed) ───────────────────────────
let _theme: Theme = (localStorage.getItem("theme") as Theme) || "light"
let _fontSize: FontSize = (localStorage.getItem("fontSize") as FontSize) || "md"
const listeners = new Set<() => void>()

function applyTheme(t: Theme) {
  _theme = t
  document.documentElement.classList.toggle("dark", t === "dark")
  localStorage.setItem("theme", t)
  listeners.forEach((fn) => fn())
}

function applyFontSize(s: FontSize) {
  _fontSize = s
  document.documentElement.style.setProperty("--content-font", FONT_PX[s])
  localStorage.setItem("fontSize", s)
  listeners.forEach((fn) => fn())
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useTheme() {
  const [, rerender] = useState(0)

  useEffect(() => {
    const notify = () => rerender((n) => n + 1)
    listeners.add(notify)
    return () => { listeners.delete(notify) }
  }, [])

  return {
    theme: _theme,
    fontSize: _fontSize,
    toggleTheme: () => applyTheme(_theme === "light" ? "dark" : "light"),
    setFontSize: (s: FontSize) => applyFontSize(s),
  }
}

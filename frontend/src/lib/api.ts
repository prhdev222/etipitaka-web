// Dev: empty string → Vite proxy → localhost:8090
// Production: VITE_API_URL=https://pb.uraree.com
const BASE = (import.meta.env.VITE_API_URL || "") + "/api/tipitaka"

export interface Lang {
  id: string
  label: string
}

export interface SearchResult {
  volume: number
  page: number
  items: string
  excerpt: string
}

export interface SearchResponse {
  query: string
  lang: string
  page: number
  perPage: number
  total: number
  pages: number
  results: SearchResult[]
}

export interface ReadResponse {
  lang: string
  volume: number
  page: number
  maxPage: number
  maxVolume: number
  items: string
  content: string
  header: string
  footer: string
}

export interface CompareResponse {
  vol: number
  page: number
  langs: string[]
  results: Record<string, { content: string; items: string; header: string; footer: string } | null>
}

export interface Volume {
  volume: number
  max_page: number
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  langs: () => get<Lang[]>(`${BASE}/langs`),

  search: (q: string, lang: string, page = 1) =>
    get<SearchResponse>(`${BASE}/search?q=${encodeURIComponent(q)}&lang=${lang}&p=${page}`),

  read: (lang: string, vol: number, page: number) =>
    get<ReadResponse>(`${BASE}/read?lang=${lang}&vol=${vol}&page=${page}`),

  compare: (vol: number, page: number, langs: string[]) =>
    get<CompareResponse>(`${BASE}/compare?vol=${vol}&page=${page}&langs=${langs.join(",")}`),

  volumes: (lang: string) =>
    get<{ lang: string; label: string; volumes: Volume[] }>(`${BASE}/volumes?lang=${lang}`),
}

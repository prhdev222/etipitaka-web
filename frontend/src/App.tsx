import { Routes, Route, Navigate } from "react-router-dom"
import Layout from "./components/Layout"
import SearchPage from "./pages/SearchPage"
import ReaderPage from "./pages/ReaderPage"
import ComparePage from "./pages/ComparePage"

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/search" replace />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/read" element={<ReaderPage />} />
        <Route path="/compare" element={<ComparePage />} />
      </Routes>
    </Layout>
  )
}

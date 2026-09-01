import { Navigate, Route, Routes } from 'react-router-dom'
import LibbyBrowse from './LibbyBrowse.jsx'
import MenuPage from './MenuPage.jsx'
import ShelfPage from './ShelfPage.jsx'
import TitlePage from './TitlePage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LibbyBrowse />} />
      <Route path="/library" element={<Navigate to="/" replace />} />
      <Route path="/library/spotlight-popular/:pageNum/:id" element={<TitlePage />} />
      <Route path="/library/spotlight-popular/:pageNum" element={<LibbyBrowse />} />
      <Route path="/title/:id" element={<TitlePage />} />
      <Route path="/shelf" element={<ShelfPage />} />
      <Route path="/menu" element={<MenuPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

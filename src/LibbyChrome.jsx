import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useLibrary } from './libraryState.jsx'
import { IconBuilding, IconClock, IconMenu, IconSearch, IconShelf } from './icons.jsx'

export default function LibbyChrome({ children }) {
  const lib = useLibrary()
  const navigate = useNavigate()
  const location = useLocation()
  const searchMode = location.search.includes('focus=search')
  const onShelf = location.pathname.startsWith('/shelf')
  const onTimeline = onShelf && location.search.includes('tab=timeline')
  const onMenu = location.pathname.startsWith('/menu')
  const onLibrary =
    !searchMode &&
    !onShelf &&
    !onMenu &&
    (location.pathname === '/' || location.pathname.startsWith('/library') || location.pathname.startsWith('/title'))

  return (
    <div className="libby">
      <aside className="libby-rail" aria-label="Zibili">
        <NavLink to="/" className={() => `libby-rail-item ${onLibrary ? 'active' : ''}`} title="Library">
          <IconBuilding />
          <span>Library</span>
        </NavLink>
        <NavLink to="/shelf" className={() => `libby-rail-item ${onShelf && !onTimeline ? 'active' : ''}`} title="Shelf">
          <IconShelf />
          <span>Shelf</span>
          {lib.loans.length + lib.holds.length > 0 && (
            <i>{lib.loans.length + lib.holds.length}</i>
          )}
        </NavLink>
        <NavLink to="/?focus=search" className={() => `libby-rail-item ${searchMode ? 'active' : ''}`} title="Search">
          <IconSearch />
          <span>Search</span>
        </NavLink>
        <button type="button" className={`libby-rail-item ${onTimeline ? 'active' : ''}`} onClick={() => navigate('/shelf?tab=timeline')} title="Timeline">
          <IconClock />
          <span>Timeline</span>
        </button>
        <NavLink to="/menu" className={() => `libby-rail-item ${onMenu ? 'active' : ''}`} title="Menu">
          <IconMenu />
          <span>Menu</span>
        </NavLink>
      </aside>

      <div className="libby-main">{children}</div>

      <nav className="libby-tabbar" aria-label="Zibili">
        <NavLink to="/" className={() => `libby-tab ${onLibrary ? 'active' : ''}`}>
          <IconBuilding />
          Library
        </NavLink>
        <NavLink to="/shelf" className={() => `libby-tab ${onShelf && !onTimeline ? 'active' : ''}`}>
          <IconShelf />
          Shelf
        </NavLink>
        <NavLink to="/?focus=search" className={() => `libby-tab ${searchMode ? 'active' : ''}`}>
          <IconSearch />
          Search
        </NavLink>
        <button type="button" className={`libby-tab ${onTimeline ? 'active' : ''}`} onClick={() => navigate('/shelf?tab=timeline')}>
          <IconClock />
          Timeline
        </button>
        <NavLink to="/menu" className={() => `libby-tab ${onMenu ? 'active' : ''}`}>
          <IconMenu />
          Menu
        </NavLink>
      </nav>

      {lib.toast && <div className="toast toast-libby">{lib.toast.message}</div>}
    </div>
  )
}

export function LibbyTop({ backTo, backLabel = 'Back', title, right }) {
  const navigate = useNavigate()
  return (
    <header className="libby-top">
      {backTo ? (
        <button
          type="button"
          className="libby-back"
          onClick={() => navigate(backTo)}
          aria-label={backLabel}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span />
      )}
      <h1>{title}</h1>
      <div className="libby-top-right">{right}</div>
    </header>
  )
}

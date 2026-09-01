import { Link } from 'react-router-dom'
import { useLibrary } from './libraryState.jsx'
import LibbyChrome, { LibbyTop } from './LibbyChrome.jsx'

export default function MenuPage() {
  const lib = useLibrary()
  return (
    <LibbyChrome>
      <LibbyTop title="Menu" backTo="/" />
      <div className="browse">
        <header className="browse-head">
          <h2>Zibili</h2>
          <p>Read and listen with your library card. Titles return by themselves.</p>
        </header>
        <ul className="title-list">
          <li>
            <p>
              <strong>{lib.loggedIn ? lib.name : 'Not signed in'}</strong>
            </p>
            <p className="title-row-format">
              {lib.loans.length} loans · {lib.holds.length} holds
            </p>
            {lib.loggedIn ? (
              <button type="button" className="text-action" onClick={lib.logout}>
                Sign out
              </button>
            ) : (
              <button type="button" className="text-action" onClick={() => lib.login('Pat')}>
                Sign in
              </button>
            )}
          </li>
          <li>
            <Link to="/shelf">Shelf</Link>
          </li>
          <li>
            <Link to="/">Library</Link>
          </li>
        </ul>
      </div>
    </LibbyChrome>
  )
}

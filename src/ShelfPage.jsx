import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BOOKS } from './data.js'
import { useLibrary } from './libraryState.jsx'
import Cover from './Cover.jsx'
import LibbyChrome, { LibbyTop } from './LibbyChrome.jsx'

export default function ShelfPage() {
  const lib = useLibrary()
  const [params] = useSearchParams()
  const initial = params.get('tab') === 'timeline' ? 'timeline' : 'loans'
  const [tab, setTab] = useState(initial)

  const taggedIds = lib.tags.wishlist || []
  const tagged = BOOKS.filter((b) => taggedIds.includes(b.id))

  return (
    <LibbyChrome>
      <LibbyTop title="Shelf" backTo="/" />
      <div className="browse">
        <div className="chip-row">
          <button type="button" className={`chip ${tab === 'loans' ? 'is-on' : ''}`} onClick={() => setTab('loans')}>
            Loans ({lib.loanedBooks.length})
          </button>
          <button type="button" className={`chip ${tab === 'holds' ? 'is-on' : ''}`} onClick={() => setTab('holds')}>
            Holds ({lib.heldBooks.length})
          </button>
          <button type="button" className={`chip ${tab === 'tags' ? 'is-on' : ''}`} onClick={() => setTab('tags')}>
            Tags ({tagged.length})
          </button>
          <button type="button" className={`chip ${tab === 'timeline' ? 'is-on' : ''}`} onClick={() => setTab('timeline')}>
            Timeline
          </button>
        </div>

        {tab === 'loans' && (
          <ul className="title-list">
            {lib.loanedBooks.length === 0 && <p className="libby-empty">Nothing borrowed yet. Explore Popular and tap Borrow.</p>}
            {lib.loanedBooks.map((item) => (
              <li key={`${item.bookId}-${item.format}`}>
                <div className="title-row">
                  <Link to={`/library/spotlight-popular/page-1/${item.bookId}`}>
                    <Cover book={item.book} format={item.format} />
                  </Link>
                  <div className="title-row-body">
                    <h3>
                      <Link to={`/library/spotlight-popular/page-1/${item.bookId}`}>{item.book.title}</Link>
                    </h3>
                    <p>{item.book.author}</p>
                    <p className="title-row-format">
                      {item.format} · due {new Date(item.due).toLocaleDateString()}
                    </p>
                    <div className="shelf-actions">
                      <button type="button" className="text-action">
                        {item.format === 'audiobook' ? 'Open Audiobook' : 'Read With Libby'}
                      </button>
                      <button type="button" className="text-action" onClick={() => lib.returnLoan(item.bookId, item.format)}>
                        Return Early
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {tab === 'holds' && (
          <ul className="title-list">
            {lib.heldBooks.length === 0 && <p className="libby-empty">No holds. Place a hold from a title’s details.</p>}
            {lib.heldBooks.map((item) => {
              const fmt = item.book.formats.find((f) => f.type === item.format) || item.book.formats[0]
              return (
                <li key={`${item.bookId}-${item.format}`}>
                  <div className="title-row">
                    <Link to={`/library/spotlight-popular/page-1/${item.bookId}`}>
                      <Cover book={item.book} format={item.format} />
                    </Link>
                    <div className="title-row-body">
                      <h3>
                        <Link to={`/library/spotlight-popular/page-1/${item.bookId}`}>{item.book.title}</Link>
                      </h3>
                      <p>{item.book.author}</p>
                      <p className="title-row-format">
                        {fmt.wait || 'Waiting'} · {item.format}
                      </p>
                      <div className="shelf-actions">
                        <button type="button" className="text-action" onClick={() => lib.cancelHold(item.bookId, item.format)}>
                          Cancel Hold
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {tab === 'tags' && (
          <ul className="title-list">
            {tagged.length === 0 && <p className="libby-empty">Tag titles you want later — they land here.</p>}
            {tagged.map((book) => (
              <li key={book.id}>
                <Link to={`/library/spotlight-popular/page-1/${book.id}`} className="title-row">
                  <Cover book={book} />
                  <div className="title-row-body">
                    <h3>{book.title}</h3>
                    <p>{book.author}</p>
                    <p className="title-row-format">wishlist</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {tab === 'timeline' && (
          <div className="timeline">
            {[...lib.loanedBooks.map((l) => ({ ...l, kind: 'Borrowed' })), ...lib.heldBooks.map((h) => ({ ...h, kind: 'Hold placed' }))]
              .sort((a, b) => new Date(b.borrowedAt || b.placedAt) - new Date(a.borrowedAt || a.placedAt))
              .map((item, i) => (
                <p key={i}>
                  <strong>{item.kind}</strong> {item.book.title}
                </p>
              ))}
            {lib.loanedBooks.length + lib.heldBooks.length === 0 && (
              <p className="libby-empty">Your activity in Libby will show up here.</p>
            )}
          </div>
        )}
      </div>
    </LibbyChrome>
  )
}

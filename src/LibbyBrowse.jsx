import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { LISTS, PAGE_SIZE, searchBooks, sortBooks } from './data.js'
import { useLibrary } from './libraryState.jsx'
import Cover from './Cover.jsx'
import LibbyChrome, { LibbyTop } from './LibbyChrome.jsx'
import { IconCard, IconClock, IconClose, IconFilter, IconHeadphones, IconPlay, IconSearch, IconTag } from './icons.jsx'

const SORTS = [
  { id: 'popularity', label: 'popularity' },
  { id: 'released', label: 'release date' },
  { id: 'title', label: 'title' },
  { id: 'author', label: 'author' },
]

export default function LibbyBrowse() {
  const { pageNum: pageParam } = useParams()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const list = params.get('list') || (q ? 'all' : 'popular')
  const format = params.get('format') || ''
  const availability = params.get('availability') || ''
  const sort = params.get('sort') || 'popularity'
  const focusSearch = params.get('focus') === 'search'
  const pageNum = Math.max(1, Number(String(pageParam || 'page-1').replace(/^page-/, '')) || 1)
  const inputRef = useRef(null)
  const [draft, setDraft] = useState(q)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sheet, setSheet] = useState(null)
  const [days, setDays] = useState(14)
  const lib = useLibrary()

  useEffect(() => {
    setDraft(q)
  }, [q])

  useEffect(() => {
    if (focusSearch) inputRef.current?.focus()
  }, [focusSearch])

  const filtered = useMemo(
    () =>
      sortBooks(
        searchBooks(q, {
          list: list === 'all' ? undefined : list,
          format: format || undefined,
          availability: availability || undefined,
        }),
        sort,
      ),
    [q, list, format, availability, sort],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(pageNum, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const heading = q ? `“${q}”` : LISTS[list]?.title || 'Popular'
  const blurb = q
    ? `${filtered.length} title${filtered.length === 1 ? '' : 's'}`
    : LISTS[list]?.blurb || 'Titles lots of people at your library are borrowing.'

  const listPath = (n) => `/library/spotlight-popular/page-${n}`
  const titlePath = (id) => `${listPath(safePage)}/${id}`

  const patchParams = (updates) => {
    const next = new URLSearchParams(params)
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setParams(next)
  }

  const submit = (e) => {
    e.preventDefault()
    const next = new URLSearchParams(params)
    if (draft.trim()) next.set('q', draft.trim())
    else next.delete('q')
    next.delete('focus')
    setParams(next)
  }

  return (
    <LibbyChrome>
      <LibbyTop
        title={q ? 'Search' : heading}
        backTo={q || focusSearch || pageParam ? '/' : undefined}
        right={
          <button type="button" className="icon-btn" aria-label="Filters" onClick={() => setFiltersOpen(true)}>
            <IconFilter />
          </button>
        }
      />
      <div className="browse catalog">
        {(focusSearch || q) && (
          <form className="libby-search" onSubmit={submit}>
            <IconSearch />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search by title, author, narrator, or subject"
            />
          </form>
        )}

        <header className="browse-head">
          <h2>{heading}</h2>
          <p>{blurb}</p>
        </header>

        <div className="libby-filters">
          <button type="button" className="filter-link" onClick={() => setFiltersOpen(true)}>
            sort: {SORTS.find((s) => s.id === sort)?.label || 'popularity'}
          </button>
          <button
            type="button"
            className={`filter-link ${format ? 'is-on' : ''}`}
            onClick={() => patchParams({ format: format === 'ebook' ? 'audiobook' : format === 'audiobook' ? '' : 'ebook' })}
          >
            {format || 'format'}
          </button>
          <button
            type="button"
            className={`filter-link ${availability ? 'is-on' : ''}`}
            onClick={() => patchParams({ availability: availability ? '' : 'available' })}
          >
            {availability === 'available' ? 'available now' : 'availability'}
          </button>
        </div>

        <ul className="libby-list">
          {pageItems.map((book) => (
            <LibbyListItem
              key={book.id}
              book={book}
              formatFilter={format}
              titlePath={titlePath(book.id)}
              onAction={(kind, fmt) => setSheet({ kind, book, format: fmt })}
            />
          ))}
        </ul>
        {pageItems.length === 0 && <p className="libby-empty">No titles match that search.</p>}

        {totalPages > 1 && (
          <nav className="pager" aria-label="Pagination">
            {safePage > 1 ? (
              <Link to={`${listPath(safePage - 1)}${params.toString() ? `?${params}` : ''}`}>Previous</Link>
            ) : (
              <span />
            )}
            <span>
              page {safePage} of {totalPages}
            </span>
            {safePage < totalPages ? (
              <Link to={`${listPath(safePage + 1)}${params.toString() ? `?${params}` : ''}`}>Next page</Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>

      {filtersOpen && (
        <div className="sheet-scrim" onClick={() => setFiltersOpen(false)}>
          <div className="sheet filter-sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <button className="sheet-close" type="button" onClick={() => setFiltersOpen(false)} aria-label="Close">
              <IconClose />
            </button>
            <p className="sheet-kicker">Filters</p>
            <div className="filter-group">
              <h3>Sort</h3>
              {SORTS.map((s) => (
                <button key={s.id} type="button" className={sort === s.id ? 'is-on' : ''} onClick={() => patchParams({ sort: s.id })}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="filter-group">
              <h3>Format</h3>
              {[
                { id: '', label: 'any' },
                { id: 'ebook', label: 'ebooks' },
                { id: 'audiobook', label: 'audiobooks' },
              ].map((s) => (
                <button key={s.label} type="button" className={format === s.id ? 'is-on' : ''} onClick={() => patchParams({ format: s.id })}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="filter-group">
              <h3>Availability</h3>
              <button type="button" className={!availability ? 'is-on' : ''} onClick={() => patchParams({ availability: '' })}>
                any
              </button>
              <button type="button" className={availability === 'available' ? 'is-on' : ''} onClick={() => patchParams({ availability: 'available' })}>
                available now
              </button>
            </div>
            <button type="button" className="maroon-btn" onClick={() => setFiltersOpen(false)}>
              Show Titles
            </button>
          </div>
        </div>
      )}

      {sheet && (
        <ActionSheet
          sheet={sheet}
          days={days}
          setDays={setDays}
          onClose={() => setSheet(null)}
          onConfirm={() => {
            if (sheet.kind === 'borrow') lib.borrow(sheet.book.id, sheet.format.type, days)
            if (sheet.kind === 'hold') lib.placeHold(sheet.book.id, sheet.format.type)
            setSheet(null)
          }}
        />
      )}
    </LibbyChrome>
  )
}

function LibbyListItem({ book, formatFilter, titlePath, onAction }) {
  const lib = useLibrary()
  const navigate = useNavigate()
  const preferred =
    formatFilter === 'audiobook'
      ? book.formats.find((f) => f.type === 'audiobook') || book.formats[0]
      : book.formats[0]
  const loaned = lib.isLoaned(book.id, preferred.type)
  const held = lib.isHeld(book.id, preferred.type)
  const tagged = lib.hasTag(book.id)
  const actionLabel = loaned ? 'Open' : preferred.available ? 'Borrow' : held ? 'Manage Hold' : 'Place Hold'
  const sampleLabel = preferred.type === 'audiobook' ? 'Listen to Sample' : 'Read Sample'

  return (
    <li className="libby-item">
      <div className="libby-item-top">
        <Link to={titlePath} className="libby-item-cover" aria-label={book.title}>
          <Cover book={book} format={preferred.type} showBadge />
          {preferred.type === 'audiobook' && (
            <span className="under-cover">
              <IconHeadphones /> {preferred.duration}
            </span>
          )}
        </Link>
        <div className="libby-item-actions">
          <button
            type="button"
            className="libby-action"
            onClick={() => {
              if (loaned) navigate('/shelf')
              else onAction(preferred.available ? 'borrow' : 'hold', preferred)
            }}
          >
            {preferred.available || loaned ? <IconCard /> : <IconClock />}
            {actionLabel}
          </button>
          <button type="button" className="libby-action" onClick={() => onAction('sample', preferred)}>
            <IconPlay />
            {sampleLabel}
          </button>
          <button type="button" className={`libby-action ${tagged ? 'is-on' : ''}`} onClick={() => lib.toggleTag(book.id)}>
            <IconTag />
            {tagged ? 'Tagged' : 'Tag'}
          </button>
        </div>
      </div>
      {book.series && (
        <p className="series-line">
          {book.series.name} #{book.series.position}
        </p>
      )}
      <h3>
        <Link to={titlePath}>{book.title}</Link>
      </h3>
      <p className="libby-item-author">
        <Link to={`/library/spotlight-popular/page-1?q=${encodeURIComponent(book.author)}`}>{book.author}</Link>
      </p>
    </li>
  )
}

function ActionSheet({ sheet, days, setDays, onClose, onConfirm }) {
  const lib = useLibrary()
  const { book, format, kind } = sheet
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <button className="sheet-close" type="button" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
        {kind === 'sample' ? (
          <>
            <p className="sheet-kicker">Sample · {book.title}</p>
            <p className="sample-body">{book.description.split('\n')[0]}</p>
            <Link to={`/library/spotlight-popular/page-1/${book.id}`} className="maroon-btn" onClick={onClose}>
              See title details
            </Link>
          </>
        ) : kind === 'borrow' ? (
          <>
            <p className="sheet-kicker">
              Borrowing <em>{book.title}</em> for{' '}
              <button type="button" className="underline-btn" onClick={() => setDays(days === 14 ? 21 : 14)}>
                {days} days
              </button>
            </p>
            <div className="sheet-card">
              <Cover book={book} format={format.type} />
              <div>
                <strong>{lib.loggedIn ? lib.name : 'Zibili'}</strong>
                <p>Card · {lib.loans.length} of 10 loans</p>
              </div>
            </div>
            <button type="button" className="maroon-btn" onClick={onConfirm}>
              Borrow
            </button>
          </>
        ) : (
          <>
            <p className="sheet-kicker">
              Place a hold on <em>{book.title}</em>?
            </p>
            <p className="wait-hero">{format.wait}</p>
            <p>
              {format.copies} copies · {format.holds} people waiting
            </p>
            <div className="sheet-card">
              <Cover book={book} format={format.type} />
              <div>
                <strong>{lib.loggedIn ? lib.name : 'Zibili'}</strong>
                <p>{lib.holds.length} of 10 holds in use</p>
              </div>
            </div>
            <button type="button" className="maroon-btn" onClick={onConfirm}>
              Place Hold
            </button>
          </>
        )}
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { getBook, relatedBooks } from './data.js'
import { useLibrary } from './libraryState.jsx'
import Cover from './Cover.jsx'
import LibbyChrome, { LibbyTop } from './LibbyChrome.jsx'
import { IconCard, IconClock, IconClose, IconHeadphones, IconPlay, IconShare, IconStar, IconTag } from './icons.jsx'

function Stars({ value }) {
  const full = Math.round(value)
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <IconStar key={i} filled={i < full} />
      ))}
    </span>
  )
}

export default function TitlePage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const book = getBook(id)
  const lib = useLibrary()
  const [formatIndex, setFormatIndex] = useState(0)
  const [confirm, setConfirm] = useState(null)
  const [days, setDays] = useState(14)
  const [expanded, setExpanded] = useState(false)
  const [sample, setSample] = useState(false)

  const fromList = location.pathname.includes('spotlight-popular') ? 'Popular' : 'Title details'
  const related = useMemo(() => (book ? relatedBooks(book) : []), [book])

  if (!book) {
    return (
      <LibbyChrome>
        <LibbyTop title="Title" backTo="/" />
        <div className="libby-empty">
          <p>We couldn’t find that title.</p>
          <Link to="/library/spotlight-popular/page-1">Keep browsing</Link>
        </div>
      </LibbyChrome>
    )
  }

  const format = book.formats[Math.min(formatIndex, book.formats.length - 1)]
  const loaned = lib.isLoaned(book.id, format.type)
  const held = lib.isHeld(book.id, format.type)
  const tagged = lib.hasTag(book.id)
  const waitersPerCopy = format.holds && format.copies ? (format.holds / format.copies).toFixed(1) : null

  const primaryAction = () => {
    if (loaned) {
      navigate('/shelf')
      return
    }
    if (format.available) setConfirm('borrow')
    else setConfirm('hold')
  }

  const confirmAction = () => {
    if (confirm === 'borrow') lib.borrow(book.id, format.type, days)
    else lib.placeHold(book.id, format.type)
    setConfirm(null)
  }

  const actionLabel = loaned ? 'Open' : format.available ? 'Borrow' : held ? 'Manage Hold' : 'Place Hold'
  const sampleLabel = format.type === 'audiobook' ? 'Listen to Sample' : 'Read Sample'

  return (
    <LibbyChrome>
      <LibbyTop
        title={fromList}
        backTo="/"
        right={
          <button
            type="button"
            className="icon-btn"
            aria-label="Share"
            onClick={() => navigator.clipboard?.writeText(window.location.href)}
          >
            <IconShare />
          </button>
        }
      />

      <article className="title-page">
        <div className="title-hero">
          <div className="title-covers">
            <Cover book={book} format={format.type} showBadge className="title-main-cover" />
            {book.formats.length > 1 && (
              <div className="format-switch">
                {book.formats.map((f, i) => (
                  <button
                    key={f.type}
                    type="button"
                    className={`format-chip-btn ${i === formatIndex ? 'is-active' : ''}`}
                    onClick={() => setFormatIndex(i)}
                  >
                    {f.type === 'audiobook' ? <IconHeadphones /> : <IconCard />}
                    {f.type}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="title-actions">
            <button type="button" className="libby-action" onClick={primaryAction}>
              {format.available || loaned ? <IconCard /> : <IconClock />}
              <span>{actionLabel}</span>
            </button>
            <button type="button" className="libby-action" onClick={() => setSample(true)}>
              <IconPlay />
              <span>{sampleLabel}</span>
            </button>
            <button type="button" className={`libby-action ${tagged ? 'is-on' : ''}`} onClick={() => lib.toggleTag(book.id)}>
              <IconTag />
              <span>{tagged ? 'Tagged' : 'Tag'}</span>
            </button>
            {!format.available && (
              <p className="wait-note">
                {format.wait} · {format.copies} cop{format.copies === 1 ? 'y' : 'ies'} · {format.holds} people waiting
                {waitersPerCopy ? ` · ${waitersPerCopy} per copy` : ''}
              </p>
            )}
            {loaned && <p className="wait-note">On your shelf — due in {lib.loans.find((l) => l.bookId === book.id)?.days || 14} days.</p>}
          </div>
        </div>

        <header className="title-meta">
          {book.series && (
            <p className="series-line">
              {book.series.name} #{book.series.position}
            </p>
          )}
          <h2>{book.title}</h2>
          <p className="byline">
            <Link to={`/library/spotlight-popular/page-1?q=${encodeURIComponent(book.author)}`}>{book.author}</Link>
            {format.narrator && (
              <>
                {' · narrated by '}
                <Link to={`/library/spotlight-popular/page-1?q=${encodeURIComponent(format.narrator)}`}>{format.narrator}</Link>
              </>
            )}
          </p>
          <p className="rating-line">
            <Stars value={book.rating} />
            <strong>{book.rating.toFixed(1)}</strong>
            <span>{book.ratingsCount.toLocaleString()} ratings</span>
          </p>
        </header>

        {book.quote && <blockquote className="title-quote">{book.quote}</blockquote>}

        <div className={`blurb ${expanded ? 'is-open' : ''}`}>
          {book.description.split('\n').map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <button type="button" className="more-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'less' : 'more'}
        </button>

        <section className="about-block">
          <h3>About this {format.type}</h3>
          <dl>
            {format.type === 'ebook' && (
              <>
                <dt>Pages</dt>
                <dd>{book.pages}</dd>
              </>
            )}
            {format.duration && (
              <>
                <dt>Duration</dt>
                <dd>{format.duration}</dd>
              </>
            )}
            <dt>Released</dt>
            <dd>{book.released}</dd>
            <dt>Publisher</dt>
            <dd>{book.publisher}</dd>
            <dt>ISBN</dt>
            <dd>{book.isbn13}</dd>
            <dt>Language</dt>
            <dd>{book.language}</dd>
            <dt>Audience</dt>
            <dd className="cap">{book.audience}</dd>
          </dl>
        </section>

        <section className="subjects">
          <h3>Subjects</h3>
          <div className="subject-row">
            {book.subjects.map((s) => (
              <Link key={s} to={`/library/spotlight-popular/page-1?q=${encodeURIComponent(s)}`}>
                {s}
              </Link>
            ))}
          </div>
        </section>

        <section className="also-row">
          <h3>Readers also borrowed</h3>
          <div className="libby-rail-books">
            {related.map((b) => (
              <Link key={b.id} to={`/library/spotlight-popular/page-1/${b.id}`} className="mini-cover">
                <Cover book={b} />
                <span>{b.title}</span>
              </Link>
            ))}
          </div>
        </section>
      </article>

      {confirm && (
        <div className="sheet-scrim" onClick={() => setConfirm(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <button className="sheet-close" type="button" onClick={() => setConfirm(null)} aria-label="Close">
              <IconClose />
            </button>
            {confirm === 'borrow' ? (
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
                    <p>Card · {lib.loans.length} of 10 loans · {lib.holds.length} of 10 holds</p>
                  </div>
                </div>
                <button type="button" className="maroon-btn" onClick={confirmAction}>
                  Borrow
                </button>
                <p className="sheet-fine">Titles return automatically. You can send this ebook to Kindle after you borrow.</p>
              </>
            ) : (
              <>
                <p className="sheet-kicker">
                  Place a hold on <em>{book.title}</em>?
                </p>
                <p className="wait-hero">{format.wait}</p>
                <p>
                  {format.copies} cop{format.copies === 1 ? 'y' : 'ies'} · {format.holds} people waiting
                  {waitersPerCopy ? ` · about ${waitersPerCopy} people per copy` : ''}
                </p>
                <div className="sheet-card">
                  <Cover book={book} format={format.type} />
                  <div>
                    <strong>{lib.loggedIn ? lib.name : 'Zibili'}</strong>
                    <p>{lib.holds.length} of 10 holds in use</p>
                  </div>
                </div>
                <button type="button" className="maroon-btn" onClick={confirmAction}>
                  Place Hold
                </button>
                <p className="sheet-fine">You’ll have 3 days to borrow it when it’s your turn. Suspend anytime to keep your place.</p>
              </>
            )}
          </div>
        </div>
      )}

      {sample && (
        <div className="sheet-scrim" onClick={() => setSample(false)}>
          <div className="sheet sample-sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <button className="sheet-close" type="button" onClick={() => setSample(false)} aria-label="Close">
              <IconClose />
            </button>
            <p className="sheet-kicker">Sample · {book.title}</p>
            {format.type === 'audiobook' ? (
              <p className="sample-body">A short audio preview would play here — {format.duration} audiobook narrated {format.narrator ? `by ${format.narrator}` : ''}.</p>
            ) : (
              <p className="sample-body">{book.description.split('\n')[0]}</p>
            )}
            <button type="button" className="maroon-btn" onClick={() => { setSample(false); primaryAction() }}>
              {actionLabel}
            </button>
          </div>
        </div>
      )}
    </LibbyChrome>
  )
}

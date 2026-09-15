// The catalog. One fetch, no fallback: if the server is down the pages say
// so instead of showing books that are not in the library.

async function loadCatalog() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const response = await fetch('/api/catalog', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    if (!response.ok) return { status: 'unavailable', books: [] }
    const data = await response.json()
    if (!Array.isArray(data)) return { status: 'unavailable', books: [] }
    return { status: data.length ? 'ok' : 'empty', books: data }
  } catch {
    return { status: 'unavailable', books: [] }
  }
}

const catalog = await loadCatalog()

export const BOOKS = catalog.books
export const CATALOG_STATUS = catalog.status

export const LISTS = {
  all: { title: 'All titles', blurb: 'Every open textbook in the library.' },
  new: { title: 'Newly added', blurb: 'The most recent additions to the library.' },
}

export const PAGE_SIZE = 10

export function catalogNotice() {
  if (CATALOG_STATUS === 'unavailable') {
    return `<div class="libby-notice" role="status">
      <h2>The catalog isn't available</h2>
      <p>Zibili could not reach its server. Check that <code>python server.py</code> is running, then reload this page.</p>
    </div>`
  }
  if (CATALOG_STATUS === 'empty') {
    return `<div class="libby-notice" role="status">
      <h2>No books yet</h2>
      <p>Drop a PDF in <code>books/</code> and run <code>python ingest.py add</code>. It will show up here.</p>
    </div>`
  }
  return ''
}

export function getBook(id) {
  return BOOKS.find((b) => b.id === id) || null
}

export function sortBooks(books, sort = 'title') {
  const copy = [...books]
  if (sort === 'author') copy.sort((a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title))
  else if (sort === 'released') copy.sort((a, b) => String(b.released).localeCompare(String(a.released)))
  else if (sort === 'added') copy.sort((a, b) => String(b.ingested_at).localeCompare(String(a.ingested_at)))
  else copy.sort((a, b) => a.title.localeCompare(b.title))
  return copy
}

export function searchBooks(query, { list, audience } = {}) {
  const q = (query || '').trim().toLowerCase()
  return BOOKS.filter((b) => {
    if (list && list !== 'all' && !(b.lists || []).includes(list)) return false
    if (audience && b.audience !== audience) return false
    if (!q) return true
    const hay = [b.title, b.author, (b.subjects || []).join(' '), (b.course_codes || []).join(' ')]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function relatedBooks(book) {
  const ids = book.similar || []
  const found = ids.map(getBook).filter(Boolean)
  if (found.length >= 6) return found
  const extra = BOOKS.filter((b) => b.id !== book.id && !ids.includes(b.id)).slice(0, 8 - found.length)
  return [...found, ...extra]
}

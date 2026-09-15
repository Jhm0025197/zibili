import { BOOKS, CATALOG_STATUS, catalogNotice, getBook } from './data.js'
import { renderLibby } from './chrome.js'
import { session } from './session.js'
import { lib } from './state.js'
import { coverHTML, escapeHtml, qs, readHref, titleHref } from './util.js'

const tab = qs('tab') || 'reading'
const taggedIds = lib.tags.wishlist || []
const tagged = BOOKS.filter((b) => taggedIds.includes(b.id))

function chips() {
  return `<div class="chip-row" role="tablist" aria-label="Shelf">
    <a class="chip ${tab === 'reading' ? 'is-on' : ''}" href="shelf.html" ${tab === 'reading' ? 'aria-current="page"' : ''}>Reading</a>
    <a class="chip ${tab === 'tags' ? 'is-on' : ''}" href="shelf.html?tab=tags" ${tab === 'tags' ? 'aria-current="page"' : ''}>Tags (${tagged.length})</a>
  </div>`
}

let body = ''
if (CATALOG_STATUS !== 'ok') {
  body = catalogNotice()
} else if (tab === 'reading') {
  body = session.person
    ? '<p class="libby-empty" data-reading-status>Loading your places…</p><ul class="title-list" data-reading hidden></ul>'
    : '<p class="libby-empty">Sign in from Menu and the books you open will land here, at the page you left.</p>'
} else {
  body =
    tagged.length === 0
      ? '<p class="libby-empty">Tag titles you want later. They land here.</p>'
      : `<ul class="title-list">${tagged
          .map(
            (book) => `<li>
              <a href="${titleHref(book.id)}" class="title-row">
                ${coverHTML(book)}
                <div class="title-row-body">
                  <h3>${escapeHtml(book.title)}</h3>
                  <p>${escapeHtml(book.author)}</p>
                </div>
              </a>
            </li>`,
          )
          .join('')}</ul>`
}

renderLibby(`<div class="browse">${chips()}${body}</div>`, {
  title: 'Shelf',
  backHref: 'index.html',
  active: 'shelf',
})

if (tab === 'reading' && session.person && CATALOG_STATUS === 'ok') loadReading()

async function loadReading() {
  const status = document.querySelector('[data-reading-status]')
  const list = document.querySelector('[data-reading]')
  try {
    const response = await fetch('/api/me/positions', { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error('positions')
    const rows = (await response.json()).filter((row) => getBook(row.book_id))
    if (!rows.length) {
      status.textContent =
        session.person.role === 'student'
          ? 'Nothing in progress yet. Open a book and it will land here, at the page you left.'
          : 'Reading places are kept for students. Open a book from the library to read it.'
      return
    }
    list.innerHTML = rows
      .map((row) => {
        const book = getBook(row.book_id)
        const where = row.section_title
          ? `${row.section_number ? `${row.section_number} ` : ''}${row.section_title}`
          : `page ${row.page}`
        return `<li>
          <a href="${readHref(book.id, row.page)}" class="title-row">
            ${coverHTML(book)}
            <div class="title-row-body">
              <h3>${escapeHtml(book.title)}</h3>
              <p>${escapeHtml(book.author)}</p>
              <p class="title-row-format">Page ${row.page} of ${row.page_count} · ${escapeHtml(where)}</p>
            </div>
          </a>
        </li>`
      })
      .join('')
    status.remove()
    list.hidden = false
    document.querySelectorAll('.cover img').forEach((img) => {
      const fallback = img.parentElement.querySelector('.cover-fallback')
      img.addEventListener('load', () => fallback?.remove())
      img.addEventListener('error', () => img.remove())
    })
  } catch {
    status.textContent = 'Could not load your reading places right now.'
  }
}

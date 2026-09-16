import { BOOKS, CATALOG_STATUS, catalogNotice, getBook, searchBooks, sortBooks } from './data.js'
import { renderLibby } from './chrome.js'
import { session } from './session.js'
import { bindCovers, coverHTML, escapeHtml, readHref, titleHref } from './util.js'

function shelf(title, href, books) {
  if (!books.length) return ''
  return `<section class="home-shelf" aria-labelledby="shelf-${escapeHtml(href.replace(/\W+/g, '-'))}">
    <div class="shelf-head">
      <h2 id="shelf-${escapeHtml(href.replace(/\W+/g, '-'))}"><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h2>
      <a href="${escapeHtml(href)}">see all</a>
    </div>
    <div class="shelf-rail">
      ${books
        .map(
          (book) => `<a href="${titleHref(book.id)}" class="shelf-card" aria-label="${escapeHtml(book.title)}">
            ${coverHTML(book)}
          </a>`,
        )
        .join('')}
    </div>
  </section>`
}

const all = sortBooks(BOOKS, 'title').slice(0, 12)
const added = sortBooks(searchBooks('', { list: 'new' }), 'added').slice(0, 12)
const subjects = [...new Set(BOOKS.flatMap((b) => b.subjects || []))].sort()

const body =
  CATALOG_STATUS !== 'ok'
    ? catalogNotice()
    : `
    <div class="home-chips" role="navigation" aria-label="Browse">
      <a href="list.html?list=all">all titles</a>
      <a href="list.html?list=new">newly added</a>
      <a href="list.html?list=random">random</a>
      <a href="#subjects">subjects</a>
    </div>

    <div data-continue></div>
    <div data-courses></div>
    ${shelf('All titles', 'list.html?list=all', all)}
    ${shelf('Newly added', 'list.html?list=new', added)}

    <section class="home-shelf" id="subjects" aria-labelledby="subjects-heading">
      <div class="shelf-head">
        <h2 id="subjects-heading">Subjects</h2>
      </div>
      <div class="home-chips home-subjects">
        ${subjects.map((s) => `<a href="list.html?q=${encodeURIComponent(s)}">${escapeHtml(s)}</a>`).join('')}
      </div>
    </section>`

renderLibby(
  `<div class="browse home-library">
    <p class="home-kicker">Your library</p>
    ${body}
  </div>`,
  { title: 'Zibili', active: 'library' },
)

bindCovers()

if (CATALOG_STATUS === 'ok' && session.person?.role === 'student') {
  loadContinue()
  loadCourses()
}

async function loadCourses() {
  try {
    const response = await fetch('/api/me/courses', { headers: { Accept: 'application/json' } })
    if (!response.ok) return
    const courses = await response.json()
    if (!courses.length) return
    const slot = document.querySelector('[data-courses]')
    slot.outerHTML = courses
      .map((course) => {
        const books = course.books.map((b) => getBook(b.id)).filter(Boolean)
        const label = `${course.code}${course.section_number ? ` · ${course.section_number}` : ''} · ${course.term_label}`
        const idAttr = `shelf-course-${escapeHtml(course.id)}`
        return `<section class="home-shelf" aria-labelledby="${idAttr}">
          <div class="shelf-head">
            <h2 id="${idAttr}">${escapeHtml(label)}</h2>
            <span class="muted small">${escapeHtml(course.title)} · ${escapeHtml(course.instructor)}</span>
          </div>
          ${
            books.length
              ? `<div class="shelf-rail">${books
                  .map(
                    (book) => `<a href="${titleHref(book.id)}" class="shelf-card" aria-label="${escapeHtml(book.title)}">${coverHTML(book)}</a>`,
                  )
                  .join('')}</div>`
              : '<p class="libby-empty">No textbook is attached to this section yet.</p>'
          }
        </section>`
      })
      .join('')
    bindCovers()
  } catch {
    // The course shelves are a convenience; the library still works without them.
  }
}

async function loadContinue() {
  try {
    const response = await fetch('/api/me/positions', { headers: { Accept: 'application/json' } })
    if (!response.ok) return
    const rows = (await response.json()).filter((row) => getBook(row.book_id)).slice(0, 12)
    if (!rows.length) return
    const slot = document.querySelector('[data-continue]')
    slot.outerHTML = `<section class="home-shelf" aria-labelledby="shelf-continue">
      <div class="shelf-head">
        <h2 id="shelf-continue"><a href="shelf.html">Continue reading</a></h2>
        <a href="shelf.html">see all</a>
      </div>
      <div class="shelf-rail">
        ${rows
          .map((row) => {
            const book = getBook(row.book_id)
            return `<a href="${readHref(book.id, row.page)}" class="shelf-card" aria-label="${escapeHtml(book.title)}, page ${row.page}">
              ${coverHTML(book)}
              <span class="shelf-card-note">p. ${row.page}</span>
            </a>`
          })
          .join('')}
      </div>
    </section>`
    bindCovers()
  } catch {
    // The shelf is a convenience; the library still works without it.
  }
}

import { BOOKS, CATALOG_STATUS, catalogNotice, searchBooks, sortBooks } from './data.js'
import { renderLibby } from './chrome.js'
import { bindCovers, coverHTML, escapeHtml, titleHref } from './util.js'

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

import { BOOKS, searchBooks } from './data.js'
import { renderLibby } from './chrome.js'
import { bindCovers, coverHTML, escapeHtml, titleHref } from './util.js'

function shelf(title, href, books) {
  if (!books.length) return ''
  return `<section class="home-shelf">
    <div class="shelf-head">
      <h2><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h2>
      <a href="${escapeHtml(href)}">see all</a>
    </div>
    <div class="shelf-rail">
      ${books
        .map(
          (book) => `<a href="${titleHref(book.id)}" class="shelf-card" aria-label="${escapeHtml(book.title)}">
            ${coverHTML(book, { format: book.formats[0].type, showBadge: true })}
          </a>`,
        )
        .join('')}
    </div>
  </section>`
}

const popular = searchBooks('', { list: 'popular' }).slice(0, 12)
const available = searchBooks('', { list: 'available' }).slice(0, 12)
const added = searchBooks('', { list: 'new' }).slice(0, 12)
const picks = searchBooks('', { list: 'picks' }).slice(0, 12)
const awards = searchBooks('', { list: 'awards' }).slice(0, 12)
const kids = BOOKS.filter((b) => b.audience === 'children').slice(0, 8)
const teens = BOOKS.filter((b) => b.audience === 'teens').slice(0, 8)

const subjects = [...new Set(BOOKS.flatMap((b) => b.subjects || []))].sort()

renderLibby(
  `<div class="browse home-library">
    <p class="home-kicker">Your library</p>
    <div class="home-chips" role="navigation" aria-label="Browse">
      <a href="list.html?list=new">just added</a>
      <a href="list.html?list=popular">popular</a>
      <a href="list.html?list=random">random</a>
      <a href="list.html?list=available">available now</a>
      <a href="#subjects">subjects</a>
    </div>

    ${shelf('Popular', 'list.html?list=popular', popular)}
    ${shelf('Available now', 'list.html?list=available', available)}
    ${shelf('Newly added', 'list.html?list=new', added)}
    ${shelf('Staff picks', 'list.html?list=picks', picks)}
    ${shelf('Awards', 'list.html?list=awards', awards)}
    ${shelf('For kids', 'list.html?audience=children', kids)}
    ${shelf('For teens', 'list.html?audience=teens', teens)}

    <section class="home-shelf" id="subjects">
      <div class="shelf-head">
        <h2>Subjects</h2>
      </div>
      <div class="home-chips home-subjects">
        ${subjects.map((s) => `<a href="list.html?q=${encodeURIComponent(s)}">${escapeHtml(s)}</a>`).join('')}
      </div>
    </section>
  </div>`,
  { title: 'Zibili', active: 'library' },
)

bindCovers()

import { BOOKS, CATALOG_STATUS, catalogNotice } from './data.js'
import { renderLibby } from './chrome.js'
import { lib } from './state.js'
import { coverHTML, escapeHtml, qs, titleHref } from './util.js'

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
  body = '<p class="libby-empty">Nothing in progress yet. Open a book and it will land here.</p>'
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

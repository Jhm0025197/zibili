import { BOOKS } from './data.js'
import { renderLibby } from './chrome.js'
import { lib } from './state.js'
import { coverHTML, escapeHtml, hasPdf, qs, readHref, titleHref } from './util.js'

const tab = qs('tab') || 'loans'
const taggedIds = lib.tags.wishlist || []
const tagged = BOOKS.filter((b) => taggedIds.includes(b.id))

function chips() {
  return `<div class="chip-row">
    <a class="chip ${tab === 'loans' ? 'is-on' : ''}" href="shelf.html">Loans (${lib.loanedBooks.length})</a>
    <a class="chip ${tab === 'holds' ? 'is-on' : ''}" href="shelf.html?tab=holds">Holds (${lib.heldBooks.length})</a>
    <a class="chip ${tab === 'tags' ? 'is-on' : ''}" href="shelf.html?tab=tags">Tags (${tagged.length})</a>
    <a class="chip ${tab === 'timeline' ? 'is-on' : ''}" href="shelf.html?tab=timeline">Timeline</a>
  </div>`
}

function row(item, extra) {
  const book = item.book
  return `<li>
    <div class="title-row">
      <a href="${titleHref(book.id)}">${coverHTML(book, { format: item.format })}</a>
      <div class="title-row-body">
        <h3><a href="${titleHref(book.id)}">${escapeHtml(book.title)}</a></h3>
        <p>${escapeHtml(book.author)}</p>
        ${extra}
      </div>
    </div>
  </li>`
}

let body = ''
if (tab === 'loans') {
  body =
    lib.loanedBooks.length === 0
      ? '<p class="libby-empty">Nothing borrowed yet. Explore Popular and tap Borrow.</p>'
      : `<ul class="title-list">${lib.loanedBooks
          .map(
            (item) =>
              row(
                item,
                `<p class="title-row-format">${escapeHtml(item.format)} · due ${new Date(item.due).toLocaleDateString()}</p>
                 <div class="shelf-actions">
                   <a class="text-action" href="${hasPdf(item.book) ? readHref(item.book.id) : titleHref(item.book.id)}">${item.format === 'audiobook' ? 'Open Audiobook' : hasPdf(item.book) ? 'Read' : 'Read With Libby'}</a>
                   <button type="button" class="text-action" data-return="${escapeHtml(item.bookId)}" data-format="${escapeHtml(item.format)}">Return Early</button>
                 </div>`,
              ),
          )
          .join('')}</ul>`
} else if (tab === 'holds') {
  body =
    lib.heldBooks.length === 0
      ? '<p class="libby-empty">No holds. Place a hold from a title’s details.</p>'
      : `<ul class="title-list">${lib.heldBooks
          .map((item) => {
            const fmt = item.book.formats.find((f) => f.type === item.format) || item.book.formats[0]
            return row(
              item,
              `<p class="title-row-format">${escapeHtml(fmt.wait || 'Waiting')} · ${escapeHtml(item.format)}</p>
               <div class="shelf-actions">
                 <button type="button" class="text-action" data-cancel="${escapeHtml(item.bookId)}" data-format="${escapeHtml(item.format)}">Cancel Hold</button>
               </div>`,
            )
          })
          .join('')}</ul>`
} else if (tab === 'tags') {
  body =
    tagged.length === 0
      ? '<p class="libby-empty">Tag titles you want later — they land here.</p>'
      : `<ul class="title-list">${tagged
          .map(
            (book) => `<li>
              <a href="${titleHref(book.id)}" class="title-row">
                ${coverHTML(book)}
                <div class="title-row-body">
                  <h3>${escapeHtml(book.title)}</h3>
                  <p>${escapeHtml(book.author)}</p>
                  <p class="title-row-format">wishlist</p>
                </div>
              </a>
            </li>`,
          )
          .join('')}</ul>`
} else {
  const events = [
    ...lib.loanedBooks.map((l) => ({ ...l, kind: 'Borrowed', at: l.borrowedAt })),
    ...lib.heldBooks.map((h) => ({ ...h, kind: 'Hold placed', at: h.placedAt })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at))
  body =
    events.length === 0
      ? '<p class="libby-empty">Your activity in Libby will show up here.</p>'
      : `<div class="timeline">${events.map((item) => `<p><strong>${item.kind}</strong> ${escapeHtml(item.book.title)}</p>`).join('')}</div>`
}

renderLibby(`<div class="browse">${chips()}${body}</div>`, {
  title: 'Shelf',
  backHref: 'index.html',
  active: tab === 'timeline' ? 'timeline' : 'shelf',
})

document.querySelectorAll('[data-return]').forEach((b) =>
  b.addEventListener('click', () => {
    lib.returnLoan(b.dataset.return, b.dataset.format)
    location.reload()
  }),
)
document.querySelectorAll('[data-cancel]').forEach((b) =>
  b.addEventListener('click', () => {
    lib.cancelHold(b.dataset.cancel, b.dataset.format)
    location.reload()
  }),
)

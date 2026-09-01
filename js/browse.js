import { LISTS, PAGE_SIZE, searchBooks, sortBooks } from './data.js'
import { icons } from './icons.js'
import { openSheet, renderLibby } from './chrome.js'
import { lib } from './state.js'
import { bindCovers, browseHref, coverHTML, escapeHtml, qs, titleHref } from './util.js'

const SORTS = [
  { id: 'popularity', label: 'popularity' },
  { id: 'released', label: 'release date' },
  { id: 'title', label: 'title' },
  { id: 'author', label: 'author' },
]

const q = qs('q')
const list = qs('list') || (q ? 'all' : 'popular')
const format = qs('format')
const availability = qs('availability')
const audience = qs('audience')
const sort = qs('sort') || 'popularity'
const focusSearch = qs('focus') === 'search'
const pageNum = Math.max(1, Number(qs('page') || '1') || 1)

const filtered = (() => {
  if (list === 'random') {
    return searchBooks('', { format: format || undefined, availability: availability || undefined, audience: audience || undefined }).sort(
      () => Math.random() - 0.5,
    )
  }
  return sortBooks(
    searchBooks(q, {
      list: list === 'all' || list === 'random' ? undefined : list,
      format: format || undefined,
      availability: availability || undefined,
      audience: audience || undefined,
    }),
    sort,
  )
})()
const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
const safePage = Math.min(pageNum, totalPages)
const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
const heading = q
  ? `“${q}”`
  : list === 'random'
    ? 'Random'
    : audience === 'children'
      ? 'For kids'
      : audience === 'teens'
        ? 'For teens'
        : LISTS[list]?.title || 'Titles'
const blurb = q
  ? `${filtered.length} title${filtered.length === 1 ? '' : 's'}`
  : list === 'random'
    ? 'A shuffled look at the collection.'
    : LISTS[list]?.blurb || 'Browse titles from your library.'

function listItem(book) {
  const preferred =
    format === 'audiobook' ? book.formats.find((f) => f.type === 'audiobook') || book.formats[0] : book.formats[0]
  const loaned = lib.isLoaned(book.id, preferred.type)
  const held = lib.isHeld(book.id, preferred.type)
  const tagged = lib.hasTag(book.id)
  const actionLabel = loaned ? 'Open' : preferred.available ? 'Borrow' : held ? 'Manage Hold' : 'Place Hold'
  const sampleLabel = preferred.type === 'audiobook' ? 'Listen to Sample' : 'Read Sample'
  return `<li class="libby-item">
    <div class="libby-item-top">
      <a href="${titleHref(book.id)}" class="libby-item-cover" aria-label="${escapeHtml(book.title)}">
        ${coverHTML(book, { format: preferred.type, showBadge: true })}
        ${preferred.type === 'audiobook' ? `<span class="under-cover">${icons.headphones} ${escapeHtml(preferred.duration || '')}</span>` : ''}
      </a>
      <div class="libby-item-actions">
        <button type="button" class="libby-action" data-act="${loaned ? 'open' : preferred.available ? 'borrow' : 'hold'}" data-id="${escapeHtml(book.id)}" data-format="${preferred.type}">
          ${preferred.available || loaned ? icons.card : icons.clock}${actionLabel}
        </button>
        <button type="button" class="libby-action" data-act="sample" data-id="${escapeHtml(book.id)}" data-format="${preferred.type}">
          ${icons.play}${sampleLabel}
        </button>
        <button type="button" class="libby-action ${tagged ? 'is-on' : ''}" data-act="tag" data-id="${escapeHtml(book.id)}">
          ${icons.tag}${tagged ? 'Tagged' : 'Tag'}
        </button>
      </div>
    </div>
    ${book.series ? `<p class="series-line">${escapeHtml(book.series.name)} #${book.series.position}</p>` : ''}
    <h3><a href="${titleHref(book.id)}">${escapeHtml(book.title)}</a></h3>
    <p class="libby-item-author"><a href="list.html?q=${encodeURIComponent(book.author)}">${escapeHtml(book.author)}</a></p>
  </li>`
}

const pager =
  totalPages > 1
    ? `<nav class="pager" aria-label="Pagination">
        ${safePage > 1 ? `<a href="${browseHref({ page: String(safePage - 1) })}">Previous</a>` : '<span></span>'}
        <span>page ${safePage} of ${totalPages}</span>
        ${safePage < totalPages ? `<a href="${browseHref({ page: String(safePage + 1) })}">Next page</a>` : '<span></span>'}
      </nav>`
    : ''

renderLibby(
  `<div class="browse catalog">
    ${
      focusSearch || q
        ? `<form class="libby-search">
            ${icons.search}
            <input name="q" value="${escapeHtml(q)}" placeholder="Search by title, author, narrator, or subject">
          </form>`
        : ''
    }
    <header class="browse-head">
      <h2>${escapeHtml(heading)}</h2>
      <p>${escapeHtml(blurb)}</p>
    </header>
    <div class="libby-filters">
      <button type="button" class="filter-link" data-filters>sort: ${SORTS.find((s) => s.id === sort)?.label || 'popularity'}</button>
      <button type="button" class="filter-link ${format ? 'is-on' : ''}" data-cycle-format>${format || 'format'}</button>
      <button type="button" class="filter-link ${availability ? 'is-on' : ''}" data-cycle-avail>${availability === 'available' ? 'available now' : 'availability'}</button>
    </div>
    <ul class="libby-list">${pageItems.map(listItem).join('')}</ul>
    ${pageItems.length === 0 ? '<p class="libby-empty">No titles match that search.</p>' : ''}
    ${pager}
  </div>`,
  {
    title: q ? 'Search' : heading,
    backHref: 'index.html',
    rightHTML: `<button type="button" class="icon-btn" aria-label="Filters" data-filters>${icons.filter}</button>`,
    active: focusSearch ? 'search' : 'library',
  },
)

document.querySelector('.libby-search')?.addEventListener('submit', (e) => {
  e.preventDefault()
  const next = e.target.querySelector('input').value.trim()
  location.href = next ? `list.html?q=${encodeURIComponent(next)}` : 'list.html?focus=search'
})

document.querySelector('[data-cycle-format]')?.addEventListener('click', () => {
  const next = format === 'ebook' ? 'audiobook' : format === 'audiobook' ? '' : 'ebook'
  location.href = browseHref({ format: next, page: '1' })
})
document.querySelector('[data-cycle-avail]')?.addEventListener('click', () => {
  location.href = browseHref({ availability: availability ? '' : 'available', page: '1' })
})

document.querySelectorAll('[data-filters]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const sheet = openSheet(`
      <button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
      <p class="sheet-kicker">Filters</p>
      <div class="filter-sheet">
        <div class="filter-group">
          <h3>Sort</h3>
          ${SORTS.map((s) => `<button type="button" class="${sort === s.id ? 'is-on' : ''}" data-sort="${s.id}">${s.label}</button>`).join('')}
        </div>
        <div class="filter-group">
          <h3>Format</h3>
          <button type="button" class="${!format ? 'is-on' : ''}" data-format="">any</button>
          <button type="button" class="${format === 'ebook' ? 'is-on' : ''}" data-format="ebook">ebooks</button>
          <button type="button" class="${format === 'audiobook' ? 'is-on' : ''}" data-format="audiobook">audiobooks</button>
        </div>
        <div class="filter-group">
          <h3>Availability</h3>
          <button type="button" class="${!availability ? 'is-on' : ''}" data-avail="">any</button>
          <button type="button" class="${availability === 'available' ? 'is-on' : ''}" data-avail="available">available now</button>
        </div>
        <button type="button" class="maroon-btn" data-show>Show Titles</button>
      </div>`)
    sheet.querySelectorAll('[data-sort]').forEach((b) =>
      b.addEventListener('click', () => {
        location.href = browseHref({ sort: b.dataset.sort, page: '1' })
      }),
    )
    sheet.querySelectorAll('[data-format]').forEach((b) =>
      b.addEventListener('click', () => {
        location.href = browseHref({ format: b.dataset.format, page: '1' })
      }),
    )
    sheet.querySelectorAll('[data-avail]').forEach((b) =>
      b.addEventListener('click', () => {
        location.href = browseHref({ availability: b.dataset.avail, page: '1' })
      }),
    )
    sheet.querySelector('[data-show]')?.addEventListener('click', () => sheet.remove())
  }),
)

document.querySelectorAll('[data-act]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const book = pageItems.find((b) => b.id === btn.dataset.id)
    if (!book) return
    const fmt = book.formats.find((f) => f.type === btn.dataset.format) || book.formats[0]
    if (btn.dataset.act === 'open') {
      location.href = 'shelf.html'
      return
    }
    if (btn.dataset.act === 'tag') {
      lib.toggleTag(book.id)
      location.reload()
      return
    }
    if (btn.dataset.act === 'sample') {
      openSheet(`
        <button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
        <p class="sheet-kicker">Sample · ${escapeHtml(book.title)}</p>
        <p class="sample-body">${escapeHtml(book.description.split('\n')[0])}</p>
        <a href="${titleHref(book.id)}" class="maroon-btn">See title details</a>`)
      return
    }
    showActionSheet(book, fmt, btn.dataset.act)
  }),
)

function showActionSheet(book, format, kind) {
  let days = 14
  const sheet = openSheet(
    kind === 'borrow'
      ? `<button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
         <p class="sheet-kicker">Borrowing <em>${escapeHtml(book.title)}</em> for <button type="button" class="underline-btn" data-days>${days} days</button></p>
         <div class="sheet-card">${coverHTML(book, { format: format.type })}<div><strong>${escapeHtml(lib.loggedIn ? lib.name : 'Zibili')}</strong><p>Card · ${lib.loans.length} of 10 loans</p></div></div>
         <button type="button" class="maroon-btn" data-confirm>Borrow</button>`
      : `<button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
         <p class="sheet-kicker">Place a hold on <em>${escapeHtml(book.title)}</em>?</p>
         <p class="wait-hero">${escapeHtml(format.wait || '')}</p>
         <p>${format.copies} copies · ${format.holds} people waiting</p>
         <div class="sheet-card">${coverHTML(book, { format: format.type })}<div><strong>${escapeHtml(lib.loggedIn ? lib.name : 'Zibili')}</strong><p>${lib.holds.length} of 10 holds in use</p></div></div>
         <button type="button" class="maroon-btn" data-confirm>Place Hold</button>`,
  )
  sheet.querySelector('[data-days]')?.addEventListener('click', (e) => {
    days = days === 14 ? 21 : 14
    e.target.textContent = `${days} days`
  })
  sheet.querySelector('[data-confirm]')?.addEventListener('click', () => {
    if (kind === 'borrow') lib.borrow(book.id, format.type, days)
    else lib.placeHold(book.id, format.type)
    location.reload()
  })
}

bindCovers()

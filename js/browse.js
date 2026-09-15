import { CATALOG_STATUS, LISTS, PAGE_SIZE, catalogNotice, searchBooks, sortBooks } from './data.js'
import { icons } from './icons.js'
import { openSheet, renderLibby } from './chrome.js'
import { lib } from './state.js'
import { bindCovers, browseHref, coverHTML, downloadHref, escapeHtml, hasPdf, qs, readHref, titleHref } from './util.js'

const SORTS = [
  { id: 'title', label: 'title' },
  { id: 'author', label: 'author' },
  { id: 'released', label: 'release date' },
  { id: 'added', label: 'date added' },
]

const q = qs('q')
const list = qs('list') || 'all'
const audience = qs('audience')
const sort = qs('sort') || 'title'
const focusSearch = qs('focus') === 'search'
const pageNum = Math.max(1, Number(qs('page') || '1') || 1)

const filtered = (() => {
  const matches = searchBooks(q, {
    list: list === 'all' || list === 'random' ? undefined : list,
    audience: audience || undefined,
  })
  if (list === 'random') return matches.sort(() => Math.random() - 0.5)
  return sortBooks(matches, sort)
})()
const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
const safePage = Math.min(pageNum, totalPages)
const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
const heading = q ? `“${q}”` : list === 'random' ? 'Random' : LISTS[list]?.title || 'Titles'
const blurb = q
  ? `${filtered.length} title${filtered.length === 1 ? '' : 's'}`
  : list === 'random'
    ? 'A shuffled look at the collection.'
    : LISTS[list]?.blurb || 'Browse titles from your library.'

function listItem(book) {
  const tagged = lib.hasTag(book.id)
  const readable = hasPdf(book)
  return `<li class="libby-item">
    <div class="libby-item-top">
      <a href="${titleHref(book.id)}" class="libby-item-cover" aria-label="${escapeHtml(book.title)}">
        ${coverHTML(book)}
      </a>
      <div class="libby-item-actions">
        ${
          readable
            ? `<a class="libby-action" href="${readHref(book.id)}">${icons.book}Read</a>
               <a class="libby-action" href="${escapeHtml(downloadHref(book))}" download="${escapeHtml(book.id)}.pdf">${icons.download}Download</a>`
            : `<a class="libby-action" href="${titleHref(book.id)}">${icons.book}Details</a>`
        }
        <button type="button" class="libby-action ${tagged ? 'is-on' : ''}" data-act="tag" data-id="${escapeHtml(book.id)}" aria-pressed="${tagged}">
          ${icons.tag}${tagged ? 'Tagged' : 'Tag'}
        </button>
      </div>
    </div>
    <h3><a href="${titleHref(book.id)}">${escapeHtml(book.title)}</a></h3>
    <p class="libby-item-author"><a href="list.html?q=${encodeURIComponent(book.author)}">${escapeHtml(book.author)}</a></p>
    ${(book.course_codes || []).length ? `<p class="libby-item-course">${escapeHtml(book.course_codes.join(', '))}</p>` : ''}
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

const results =
  CATALOG_STATUS !== 'ok'
    ? catalogNotice()
    : `<ul class="libby-list">${pageItems.map(listItem).join('')}</ul>
       ${pageItems.length === 0 ? '<p class="libby-empty">No titles match that search.</p>' : ''}
       ${pager}`

renderLibby(
  `<div class="browse catalog">
    ${
      focusSearch || q
        ? `<form class="libby-search" role="search">
            ${icons.search}
            <label class="sr-only" for="search-input">Search</label>
            <input id="search-input" name="q" value="${escapeHtml(q)}" placeholder="Search by title, author, course, or subject" ${focusSearch ? 'autofocus' : ''}>
          </form>`
        : ''
    }
    <header class="browse-head">
      <h2>${escapeHtml(heading)}</h2>
      <p>${escapeHtml(blurb)}</p>
    </header>
    ${
      CATALOG_STATUS === 'ok' && list !== 'random'
        ? `<div class="libby-filters">
            <button type="button" class="filter-link" data-filters>sort: ${SORTS.find((s) => s.id === sort)?.label || 'title'}</button>
          </div>`
        : ''
    }
    ${results}
  </div>`,
  {
    title: q ? 'Search' : heading,
    backHref: 'index.html',
    rightHTML: `<button type="button" class="icon-btn" aria-label="Sort" data-filters>${icons.filter}</button>`,
    active: focusSearch ? 'search' : 'library',
  },
)

document.querySelector('.libby-search')?.addEventListener('submit', (e) => {
  e.preventDefault()
  const next = e.target.querySelector('input').value.trim()
  location.href = next ? `list.html?q=${encodeURIComponent(next)}` : 'list.html?focus=search'
})

document.querySelectorAll('[data-filters]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const sheet = openSheet(
      `<button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
      <p class="sheet-kicker">Sort</p>
      <div class="filter-sheet">
        <div class="filter-group">
          ${SORTS.map((s) => `<button type="button" class="${sort === s.id ? 'is-on' : ''}" data-sort="${s.id}">${s.label}</button>`).join('')}
        </div>
      </div>`,
      { label: 'Sort titles' },
    )
    sheet.querySelectorAll('[data-sort]').forEach((b) =>
      b.addEventListener('click', () => {
        location.href = browseHref({ sort: b.dataset.sort, page: '1' })
      }),
    )
  }),
)

document.querySelectorAll('[data-act="tag"]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const on = lib.toggleTag(btn.dataset.id)
    btn.classList.toggle('is-on', on)
    btn.setAttribute('aria-pressed', String(on))
    btn.innerHTML = `${icons.tag}${on ? 'Tagged' : 'Tag'}`
  }),
)

bindCovers()

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function qs(name, fallback = '') {
  return new URLSearchParams(location.search).get(name) || fallback
}

export function coverHTML(book, { format = 'ebook', className = '', showBadge = false } = {}) {
  const audio = format === 'audiobook'
  return `<div class="cover${audio ? ' cover--audio' : ''} ${className}">
    <div class="cover-fallback" style="background:${escapeHtml(book.color || '#194257')}">
      <span class="cover-fallback-title">${escapeHtml(book.title)}</span>
      <span class="cover-fallback-author">${escapeHtml(book.author)}</span>
    </div>
    <img src="${escapeHtml(book.cover)}" alt="">
    ${showBadge && audio ? '<span class="cover-audio-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 13a8 8 0 0116 0"/><rect x="3" y="13" width="4" height="7" rx="1.4"/><rect x="17" y="13" width="4" height="7" rx="1.4"/></svg></span>' : ''}
  </div>`
}

export function bindCovers(root = document) {
  root.querySelectorAll('.cover img').forEach((img) => {
    const fallback = img.parentElement.querySelector('.cover-fallback')
    img.addEventListener('load', () => fallback?.remove())
    img.addEventListener('error', () => img.remove())
  })
}

export function titleHref(id) {
  return `title.html?id=${encodeURIComponent(id)}`
}

export function readHref(id, page) {
  const params = new URLSearchParams({ id })
  if (page) params.set('page', String(page))
  return `read.html?${params}`
}

export function hasPdf(book) {
  return Boolean(book?.pdf)
}

export function downloadHref(book) {
  if (!book?.pdf) return ''
  return `${book.pdf}?download=1`
}

export function browseHref(params = {}) {
  const next = new URLSearchParams(location.search)
  Object.entries(params).forEach(([key, value]) => {
    if (value) next.set(key, value)
    else next.delete(key)
  })
  const q = next.toString()
  return q ? `list.html?${q}` : 'list.html'
}

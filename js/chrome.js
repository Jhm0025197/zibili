import { icons } from './icons.js'
import { bindCovers } from './util.js'
import { lib } from './state.js'

export function renderLibby(mainHTML, { title, backHref, rightHTML = '', active = 'library' } = {}) {
  const count = lib.loans.length + lib.holds.length
  const tab = (id, href, icon, label, extra = '') =>
    `<a href="${href}" class="libby-rail-item libby-tab ${active === id ? 'active' : ''}">${icon}<span>${label}</span>${extra}</a>`

  const badge = count ? `<i>${count}</i>` : ''
  const nav = `
    ${tab('library', 'index.html', icons.building, 'Library')}
    ${tab('shelf', 'shelf.html', icons.shelf, 'Shelf', badge)}
    ${tab('search', 'list.html?focus=search', icons.search, 'Search')}
    ${tab('timeline', 'shelf.html?tab=timeline', icons.clock, 'Timeline')}
    ${tab('menu', 'menu.html', icons.menu, 'Menu')}
  `

  document.body.innerHTML = `
    <div class="libby">
      <aside class="libby-rail" aria-label="Zibili">${nav}</aside>
      <div class="libby-main">
        <header class="libby-top">
          ${
            backHref
              ? `<button type="button" class="libby-back" aria-label="Back">${icons.back}</button>`
              : '<span></span>'
          }
          <h1>${title}</h1>
          <div class="libby-top-right">${rightHTML}</div>
        </header>
        ${mainHTML}
      </div>
      <nav class="libby-tabbar" aria-label="Zibili">${nav}</nav>
    </div>`

  document.querySelector('.libby-back')?.addEventListener('click', () => {
    location.href = backHref
  })
  bindCovers()
}

export function openSheet(html) {
  document.querySelector('.sheet-scrim')?.remove()
  const scrim = document.createElement('div')
  scrim.className = 'sheet-scrim'
  scrim.innerHTML = `<div class="sheet" role="dialog">${html}</div>`
  document.body.append(scrim)
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) scrim.remove()
  })
  scrim.querySelector('.sheet-close')?.addEventListener('click', () => scrim.remove())
  bindCovers(scrim)
  return scrim
}

import { icons } from './icons.js'
import { bindCovers } from './util.js'

// App shell: side rail on wide screens, tab bar on narrow ones, one <main>.
// Pages call renderLibby(html, options) once and then bind their handlers.

export function renderLibby(mainHTML, { title, backHref, rightHTML = '', active = 'library', tabs = [] } = {}) {
  const tab = (id, href, icon, label) =>
    `<a href="${href}" class="libby-rail-item libby-tab ${active === id ? 'active' : ''}" ${
      active === id ? 'aria-current="page"' : ''
    }>${icon}<span>${label}</span></a>`

  const nav = [
    tab('library', 'index.html', icons.building, 'Library'),
    tab('shelf', 'shelf.html', icons.shelf, 'Shelf'),
    tab('search', 'list.html?focus=search', icons.search, 'Search'),
    ...tabs.map((t) => tab(t.id, t.href, t.icon, t.label)),
    tab('menu', 'menu.html', icons.menu, 'Menu'),
  ].join('')

  document.body.innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <div class="libby">
      <nav class="libby-rail" aria-label="Primary">${nav}</nav>
      <div class="libby-main">
        <header class="libby-top">
          ${
            backHref
              ? `<a class="libby-back" href="${backHref}" aria-label="Back">${icons.back}</a>`
              : '<span></span>'
          }
          <h1>${title}</h1>
          <div class="libby-top-right">${rightHTML}</div>
        </header>
        <main id="main" tabindex="-1">${mainHTML}</main>
      </div>
      <nav class="libby-tabbar" aria-label="Primary">${nav}</nav>
    </div>`

  bindCovers()
}

// Bottom sheet. Returns the scrim element. Closes on scrim click, the close
// button, or Escape, and hands focus back to whatever opened it.
export function openSheet(html, { label = 'Dialog' } = {}) {
  document.querySelector('.sheet-scrim')?.remove()
  const opener = document.activeElement
  const scrim = document.createElement('div')
  scrim.className = 'sheet-scrim'
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${label}">${html}</div>`
  document.body.append(scrim)

  const close = () => {
    document.removeEventListener('keydown', onKey)
    scrim.remove()
    if (opener && typeof opener.focus === 'function') opener.focus()
  }
  const onKey = (event) => {
    if (event.key === 'Escape') close()
  }
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close()
  })
  scrim.querySelector('.sheet-close')?.addEventListener('click', close)
  document.addEventListener('keydown', onKey)
  scrim.close = close
  bindCovers(scrim)

  const first = scrim.querySelector('.sheet [autofocus], .sheet button:not(.sheet-close), .sheet a, .sheet input')
  ;(first || scrim.querySelector('.sheet-close'))?.focus()
  return scrim
}

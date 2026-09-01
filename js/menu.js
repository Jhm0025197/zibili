import { renderLibby } from './chrome.js'
import { lib } from './state.js'
import { escapeHtml } from './util.js'

renderLibby(
  `<div class="browse">
    <header class="browse-head">
      <h2>Zibili</h2>
      <p>Read and listen with your library card. Titles return by themselves.</p>
    </header>
    <ul class="title-list">
      <li>
        <p><strong>${lib.loggedIn ? escapeHtml(lib.name) : 'Not signed in'}</strong></p>
        <p class="title-row-format">${lib.loans.length} loans · ${lib.holds.length} holds</p>
        <button type="button" class="text-action" data-auth>${lib.loggedIn ? 'Sign out' : 'Sign in'}</button>
      </li>
      <li><a href="shelf.html">Shelf</a></li>
      <li><a href="index.html">Library</a></li>
    </ul>
  </div>`,
  { title: 'Menu', backHref: 'index.html', active: 'menu' },
)

document.querySelector('[data-auth]')?.addEventListener('click', () => {
  if (lib.loggedIn) lib.logout()
  else lib.login('Pat')
  location.reload()
})

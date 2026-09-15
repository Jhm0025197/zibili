import { icons } from './icons.js'
import { session, signOut } from './session.js'
import { escapeHtml } from './util.js'

// The shell for the staff windows (course, college). Not the library's:
// no Library, Shelf or Search, nothing student-facing. The server only
// serves these pages to the right role, so the role check on each page is a
// courtesy for a session that ended while the tab was open.

export function renderWindow(mainHTML, { sub, icon = icons.college } = {}) {
  const person = session.person
  document.body.innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <div class="admin">
      <header class="admin-top">
        <div class="admin-brand">${icon}<span>Zibili</span><span class="admin-brand-sub">${escapeHtml(sub)}</span></div>
        <div class="admin-who">
          ${person ? `<span>${escapeHtml(person.display_name)}</span>` : ''}
          <a href="index.html" target="_blank" rel="noopener">Open the library</a>
          ${person ? '<button type="button" class="text-action" data-signout>Sign out</button>' : ''}
        </div>
      </header>
      <main id="main" tabindex="-1" class="dash admin-main">${mainHTML}</main>
    </div>`
  document.querySelector('[data-signout]')?.addEventListener('click', async () => {
    await signOut()
    location.href = 'index.html'
  })
}

import { renderLibby } from './chrome.js'
import { flash } from './state.js'
import { escapeHtml } from './util.js'
import { loadPeople, session, signIn, signOut } from './session.js'

const ROLE_LABEL = { admin: 'Administration', instructor: 'Instructors', student: 'Students' }
const ROLE_ORDER = ['admin', 'instructor', 'student']

function signedInView() {
  const person = session.person
  const course = session.course
  const links = []
  if (person.role === 'instructor') links.push('<li><a href="course">Open your course view</a> <span class="title-row-format">A separate window; students never see it.</span></li>')
  if (person.role === 'admin') links.push('<li><a href="admin">Open the college view</a> <span class="title-row-format">A separate window; students never see it.</span></li>')
  return `<ul class="title-list">
    <li>
      <p><strong>${escapeHtml(person.display_name)}</strong></p>
      <p class="title-row-format">${escapeHtml(person.role)}${course ? ` · ${escapeHtml(course.code)} · ${escapeHtml(course.term_label)}` : ''}</p>
      <button type="button" class="text-action" data-signout>Sign out</button>
    </li>
    ${links.join('')}
    <li><a href="shelf.html">Shelf</a></li>
    <li><a href="index.html">Library</a></li>
  </ul>`
}

function pickerShell() {
  return `<div class="picker" data-picker>
    <p class="title-row-format">This is the v1 dev sign-in. Pick a seeded person; there are no passwords.</p>
    <p class="libby-empty" data-picker-status>Loading people…</p>
  </div>`
}

renderLibby(
  `<div class="browse">
    <header class="browse-head">
      <h2>Zibili</h2>
      <p>Open textbooks for your courses. Read in the browser or download the PDF.</p>
    </header>
    ${session.person ? signedInView() : pickerShell()}
  </div>`,
  { title: 'Menu', backHref: 'index.html', active: 'menu' },
)

document.querySelector('[data-signout]')?.addEventListener('click', async () => {
  await signOut()
  flash('Signed out')
  location.href = 'index.html'
})

if (!session.person) {
  loadPeople()
    .then((people) => {
      const groups = ROLE_ORDER.map((r) => ({ role: r, people: people.filter((p) => p.role === r) })).filter(
        (g) => g.people.length,
      )
      const picker = document.querySelector('[data-picker]')
      picker.querySelector('[data-picker-status]')?.remove()
      picker.insertAdjacentHTML(
        'beforeend',
        groups
          .map(
            (g) => `<section class="picker-group" aria-labelledby="picker-${g.role}">
              <h3 id="picker-${g.role}">${ROLE_LABEL[g.role]}</h3>
              <ul>
                ${g.people
                  .map(
                    (p) => `<li><button type="button" class="picker-person" data-person="${escapeHtml(p.id)}">${escapeHtml(p.display_name)}</button></li>`,
                  )
                  .join('')}
              </ul>
            </section>`,
          )
          .join(''),
      )
      picker.querySelectorAll('[data-person]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          btn.disabled = true
          try {
            const result = await signIn(btn.dataset.person)
            flash(`Signed in as ${result.person.display_name}`)
            const next = result.person.role === 'instructor' ? 'course' : result.person.role === 'admin' ? 'admin' : 'index.html'
            location.href = next
          } catch (error) {
            btn.disabled = false
            flash(error.message || 'Could not sign in')
          }
        }),
      )
    })
    .catch(() => {
      const status = document.querySelector('[data-picker-status]')
      if (status) status.textContent = 'Could not load people. Check that the server is running.'
    })
}

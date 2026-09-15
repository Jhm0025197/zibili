import { icons } from './icons.js'
import { emptyState, formatDuration, money, statTile } from './format.js'
import { session, signOut } from './session.js'
import { escapeHtml, qs } from './util.js'

// The college window. Its own shell, not the library's: no Library, Shelf
// or Search, no student-facing chrome. The server only serves this page to a
// signed-in admin, so anyone else never sees it; the check here is a
// courtesy for a session that expired while the tab was open.
//
// Four numbers and a drill-down by course. Aggregates only: this page never
// asks for a name or a hash, and the queries behind it cannot return one.

const termParam = qs('term')

function shell(mainHTML) {
  const person = session.person
  document.body.innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <div class="admin">
      <header class="admin-top">
        <div class="admin-brand">${icons.college}<span>Zibili</span><span class="admin-brand-sub">College view</span></div>
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

function delta(current, previous) {
  if (previous === 0 && current === 0) return 'No change'
  if (previous === 0) return `+${current}`
  const change = Math.round(((current - previous) / previous) * 100)
  if (change === 0) return 'No change'
  return `${change > 0 ? '+' : ''}${change}%`
}

if (session.person?.role !== 'admin') {
  shell(emptyState('This window is for the administration.', '<p>Your session has ended or you are signed in as someone else. <a href="menu.html">Sign in from the library</a> as Dana Okafor to come back.</p>'))
} else {
  render()
}

async function render() {
  shell('<p class="libby-empty">Loading…</p>')
  let data
  try {
    const response = await fetch(`/api/college/summary${termParam ? `?term=${encodeURIComponent(termParam)}` : ''}`, {
      headers: { Accept: 'application/json' },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body?.error?.message || `Request failed (${response.status})`)
    data = body
  } catch (error) {
    shell(emptyState('Could not load the college view.', `<p>${escapeHtml(error.message)}</p>`))
    return
  }
  const { spend, terms, current, previous, sections_live: sectionsLive, elapsed_days: elapsedDays, courses } = data
  if (!current) {
    shell(emptyState('No terms are set up yet.', '<p>Seed data lives in <code>seed/course.json</code>.</p>'))
    return
  }
  const fee = courses.find((c) => c.fee_cents)?.fee_cents
  const youngTerm = elapsedDays < 21

  shell(`
    <header class="dash-head">
      <h1>${escapeHtml(current.term_label)}</h1>
      <p class="dash-lede">What the college stopped paying, and what students are doing with what replaced it. Every figure below is computed from rows in the ledger; nothing is estimated except where it says so.</p>
      ${
        terms.length > 1
          ? `<nav class="term-nav" aria-label="Term">${terms
              .map(
                (t) => `<a href="admin?term=${encodeURIComponent(t.term)}" class="pill ${t.term === current.term ? 'is-on' : ''}" ${
                  t.term === current.term ? 'aria-current="page"' : ''
                }>${escapeHtml(t.term_label)}</a>`,
              )
              .join('')}</nav>`
          : ''
      }
    </header>

    <section aria-label="Headline figures" class="stat-grid">
      ${statTile({
        label: spend.verified ? 'Dollars displaced' : 'Dollars displaced (estimate)',
        value: money(current.displaced_cents, spend.currency),
        hint: `${current.students_enrolled} enrolments × ${fee ? money(fee, spend.currency) : 'fee'} prior course fee${spend.verified ? '' : ' · placeholder fee, not yet verified against the contract'}`,
      })}
      ${statTile({
        label: 'Students active',
        value: `${current.students_active} of ${current.students_enrolled}`,
        hint: current.students_active === 0 ? 'Nobody has opened a book this term yet' : 'Opened at least one section this term',
        tone: current.students_active === 0 ? 'quiet' : 'normal',
      })}
      ${statTile({ label: 'Sections live', value: String(sectionsLive), hint: 'Available to read across this term’s books' })}
      ${statTile({
        label: previous ? `Change since ${escapeHtml(previous.term_label)}` : 'Change since last term',
        value: previous ? delta(current.students_active, previous.students_active) : '—',
        hint: previous ? `Students active: ${previous.students_active} → ${current.students_active}` : 'No earlier term to compare against',
        tone: previous ? 'normal' : 'quiet',
      })}
    </section>

    ${
      youngTerm && previous
        ? `<p class="card callout">${escapeHtml(current.term_label)} is ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} old. ${escapeHtml(previous.term_label)} is a completed term, so the comparison above is not like for like yet. It will be worth reading around week four.</p>`
        : ''
    }

    <section aria-labelledby="terms-heading" class="dash-section">
      <h2 id="terms-heading">Term by term</h2>
      <div class="card table-wrap">
        <table class="data">
          <caption class="sr-only">Totals for every term on Zibili</caption>
          <thead><tr><th scope="col">Term</th><th scope="col">Courses</th><th scope="col">Enrolments</th><th scope="col">Students active</th><th scope="col">Sections opened</th><th scope="col">Reading time</th><th scope="col">Displaced</th></tr></thead>
          <tbody>
            ${terms
              .map(
                (t) => `<tr class="${t.term === current.term ? 'is-current' : ''}">
                  <th scope="row"><a href="admin?term=${encodeURIComponent(t.term)}">${escapeHtml(t.term_label)}</a></th>
                  <td class="tabular">${t.courses}</td>
                  <td class="tabular">${t.students_enrolled}</td>
                  <td class="tabular">${t.students_active}</td>
                  <td class="tabular">${t.sections_opened}</td>
                  <td class="tabular">${formatDuration(t.dwell_seconds)}</td>
                  <td class="tabular">${money(t.displaced_cents, spend.currency)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="courses-heading" class="dash-section">
      <h2 id="courses-heading">${escapeHtml(current.term_label)} by course</h2>
      ${
        courses.length === 0
          ? emptyState(`No courses ran in ${escapeHtml(current.term_label)}.`, '<p>Nothing to break down.</p>')
          : `<div class="card table-wrap">
            <table class="data">
              <caption class="sr-only">Every course running in ${escapeHtml(current.term_label)}</caption>
              <thead><tr><th scope="col">Course</th><th scope="col">Instructor</th><th scope="col">Enrolled</th><th scope="col">Active</th><th scope="col">Sections opened</th><th scope="col">Reading time</th><th scope="col">Prior provider</th><th scope="col">Displaced</th></tr></thead>
              <tbody>
                ${courses
                  .map(
                    (c) => `<tr>
                      <th scope="row">${escapeHtml(c.code)}<span class="muted small block">${escapeHtml(c.title)}</span></th>
                      <td>${escapeHtml(c.instructor)}</td>
                      <td class="tabular">${c.enrolled}</td>
                      <td class="tabular">${c.students_active === 0 ? '<span class="muted">None yet</span>' : c.students_active}</td>
                      <td class="tabular">${c.sections_opened}</td>
                      <td class="tabular">${formatDuration(c.dwell_seconds)}</td>
                      <td class="muted">${c.provider ? escapeHtml(c.provider) : '<span class="muted">Not recorded</span>'}</td>
                      <td class="tabular">${c.fee_cents === null ? '<span class="muted">—</span>' : money(c.displaced_cents, spend.currency)}</td>
                    </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`
      }
      <p class="muted small dash-note">Displaced spend is the prior per-student course fee multiplied by enrolments, from <code>seed/prior-spend.json</code>. ${
        spend.verified
          ? 'Those fees have been checked against the bookstore contract.'
          : 'Those fees are a synthetic placeholder and have not been checked against the bookstore contract, so this figure is an estimate and is labelled as one.'
      } This window never sees an individual student.</p>
    </section>
  `)
}

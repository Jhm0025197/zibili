import { renderLibby } from './chrome.js'
import { emptyState, formatDuration, money, statTile } from './format.js'
import { session } from './session.js'
import { escapeHtml, qs } from './util.js'

// The college view. Four numbers and a drill-down by course. Aggregates
// only: this page never asks for a name or a hash, and the queries behind
// it cannot return one. A term that has barely started is labelled as such
// rather than compared flat against a completed one, and the dollar figure
// says out loud whether its inputs have been verified.

const termParam = qs('term')

function frame(html) {
  renderLibby(`<div class="dash">${html}</div>`, { title: 'College', backHref: 'index.html', active: 'college' })
}

function delta(current, previous) {
  if (previous === 0 && current === 0) return 'No change'
  if (previous === 0) return `+${current}`
  const change = Math.round(((current - previous) / previous) * 100)
  if (change === 0) return 'No change'
  return `${change > 0 ? '+' : ''}${change}%`
}

if (!session.person) {
  frame(emptyState('This page is for the administration.', '<p>Choose <strong>Dana Okafor</strong> in <a href="menu.html">Menu</a> to see it.</p>'))
} else if (session.person.role !== 'admin') {
  frame(
    emptyState(
      `You are signed in as ${escapeHtml(session.person.display_name)}.`,
      '<p>The college view is for the administration. Choose Dana Okafor in <a href="menu.html">Menu</a> to see it.</p>',
    ),
  )
} else {
  render()
}

async function render() {
  frame('<p class="libby-empty">Loading…</p>')
  let data
  try {
    const response = await fetch(`/api/college/summary${termParam ? `?term=${encodeURIComponent(termParam)}` : ''}`, {
      headers: { Accept: 'application/json' },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body?.error?.message || `Request failed (${response.status})`)
    data = body
  } catch (error) {
    frame(emptyState('Could not load the college view.', `<p>${escapeHtml(error.message)}</p>`))
    return
  }
  const { spend, terms, current, previous, sections_live: sectionsLive, elapsed_days: elapsedDays, courses } = data
  if (!current) {
    frame(emptyState('No terms are set up yet.', '<p>Seed data lives in <code>seed/course.json</code>.</p>'))
    return
  }
  const fee = courses.find((c) => c.fee_cents)?.fee_cents
  const youngTerm = elapsedDays < 21

  frame(`
    <header class="dash-head">
      <h2>${escapeHtml(current.term_label)}</h2>
      <p class="dash-lede">What the college stopped paying, and what students are doing with what replaced it. Every figure below is computed from rows in the ledger; nothing is estimated except where it says so.</p>
      ${
        terms.length > 1
          ? `<nav class="term-nav" aria-label="Term">${terms
              .map(
                (t) => `<a href="college.html?term=${encodeURIComponent(t.term)}" class="pill ${t.term === current.term ? 'is-on' : ''}" ${
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
      <h3 id="terms-heading">Term by term</h3>
      <div class="card table-wrap">
        <table class="data">
          <caption class="sr-only">Totals for every term on Zibili</caption>
          <thead><tr><th scope="col">Term</th><th scope="col">Courses</th><th scope="col">Enrolments</th><th scope="col">Students active</th><th scope="col">Sections opened</th><th scope="col">Reading time</th><th scope="col">Displaced</th></tr></thead>
          <tbody>
            ${terms
              .map(
                (t) => `<tr class="${t.term === current.term ? 'is-current' : ''}">
                  <th scope="row"><a href="college.html?term=${encodeURIComponent(t.term)}">${escapeHtml(t.term_label)}</a></th>
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
      <h3 id="courses-heading">${escapeHtml(current.term_label)} by course</h3>
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
      } This page never sees an individual student.</p>
    </section>
  `)
}

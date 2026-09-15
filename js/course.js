import { icons } from './icons.js'
import { emptyState, formatDuration, formatRelative, percent, statTile } from './format.js'
import { session } from './session.js'
import { escapeHtml, qs, readHref } from './util.js'
import { renderWindow } from './window.js'

// The professor window. One course, one term, real rows. Everything here is
// the ledger joined to the roster for this instructor's own course. There is
// no cross-course data here and no reading profiles anywhere.

const courseParam = qs('course')
const studentParam = qs('student')

function frame(html) {
  renderWindow(`<div class="dash">${html}</div>`, { sub: 'Course view', icon: icons.course })
}

function courseHref(courseId, studentHash = null) {
  const params = new URLSearchParams()
  if (courseId) params.set('course', courseId)
  if (studentHash) params.set('student', studentHash)
  const query = params.toString()
  return query ? `course?${query}` : 'course'
}

async function api(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return body
}

function sectionLabel(row) {
  const number = row.number ? `<span class="tabular muted">${escapeHtml(row.number)}</span> ` : ''
  return `${number}${escapeHtml(row.title || row.chunk_id || row.id)}`
}

function sectionLink(bookId, row) {
  if (!row.start_page) return sectionLabel(row)
  return `<a href="${readHref(bookId, row.start_page)}" target="_blank" rel="noopener">${sectionLabel(row)}</a>`
}

function termNav(courses, current) {
  if (courses.length < 2) return ''
  return `<nav class="term-nav" aria-label="Term">
    ${courses
      .map(
        (c) => `<a href="${courseHref(c.id)}" class="pill ${c.id === current.id ? 'is-on' : ''}" ${c.id === current.id ? 'aria-current="page"' : ''}>${escapeHtml(c.term_label)}</a>`,
      )
      .join('')}
  </nav>`
}

if (session.person?.role !== 'instructor') {
  frame(
    emptyState(
      'This window is for the instructor of a course.',
      '<p>Your session has ended or you are signed in as someone else. <a href="menu.html">Sign in from the library</a> as Prof. Marisol Reyes to come back.</p>',
    ),
  )
} else if (studentParam) {
  renderStudent()
} else {
  renderRoster()
}

async function renderRoster() {
  frame('<p class="libby-empty">Loading the roster…</p>')
  let data
  try {
    data = await api(`/api/instructor/roster${courseParam ? `?course=${encodeURIComponent(courseParam)}` : ''}`)
  } catch (error) {
    frame(emptyState('Could not load the roster.', `<p>${escapeHtml(error.message)}</p>`))
    return
  }
  const { courses, course, roster, rollup, assigned } = data
  if (!course) {
    frame(emptyState('No courses are attached to this instructor.', '<p>Seed data lives in <code>seed/course.json</code>.</p>'))
    return
  }
  const active = roster.filter((s) => s.last_active)
  const assignedTotal = roster[0]?.assigned_total ?? course.assigned
  const totalDwell = roster.reduce((sum, s) => sum + s.dwell_seconds, 0)
  const meanCompletion =
    roster.length && assignedTotal ? roster.reduce((sum, s) => sum + s.assigned_read / assignedTotal, 0) / roster.length : 0
  const assignedIds = new Set(assigned.map((a) => a.id))
  const assignedRollup = rollup.filter((r) => assignedIds.has(r.chunk_id))
  const mostRead = [...assignedRollup].sort((a, b) => b.readers - a.readers || b.finished - a.finished).slice(0, 5)
  const leastRead = [...assignedRollup].sort((a, b) => a.readers - b.readers || a.finished - b.finished).slice(0, 5)
  const touched = new Set(rollup.map((r) => r.chunk_id))
  const untouched = assigned.filter((a) => !touched.has(a.id))
  const dwellValues = active.map((s) => s.dwell_seconds).sort((a, b) => a - b)
  const median = dwellValues.length ? dwellValues[Math.floor(dwellValues.length / 2)] : 0
  const outliers = active
    .filter((s) => median > 0 && (s.dwell_seconds > median * 2 || s.dwell_seconds < median / 3))
    .sort((a, b) => b.dwell_seconds - a.dwell_seconds)

  const header = `<header class="dash-head">
    <p class="dash-kicker">${escapeHtml(course.code)} · ${escapeHtml(course.term_label)}</p>
    <h1>${escapeHtml(course.title)}</h1>
    <p class="dash-lede">${course.enrolled} students, ${assignedTotal} sections set as reading. A section counts as read when a student reached the end of it and stayed at least a quarter of its estimated reading time.</p>
    ${termNav(courses, course)}
  </header>`

  if (!active.length) {
    frame(
      header +
        emptyState(
          `Nobody has opened the book in ${escapeHtml(course.term_label)} yet.`,
          '<p>This is the real count, not a placeholder. As soon as a student opens a section it will appear here on the next reload.</p><p>To try it: open the library in another window, sign in as a student, read a few sections, then come back.</p>',
        ),
    )
    return
  }

  const sectionList = (title, rows) => `<div class="card">
    <h3 class="card-title">${title}</h3>
    <ul class="plain-list">
      ${rows
        .map(
          (row) => `<li>${sectionLink(course.book_id, row)}<span class="muted small tabular">${row.readers} of ${course.enrolled} opened · ${row.finished} finished</span></li>`,
        )
        .join('')}
    </ul>
  </div>`

  frame(
    header +
      `<section aria-label="Course totals" class="stat-grid">
        ${statTile({ label: 'Students active', value: `${active.length} of ${roster.length}`, hint: 'Opened at least one section this term' })}
        ${statTile({ label: 'Mean assigned read', value: percent(meanCompletion), hint: `Across ${assignedTotal} assigned sections` })}
        ${statTile({ label: 'Total time on the book', value: formatDuration(totalDwell), hint: 'Counted only while the tab was visible' })}
        ${statTile({ label: 'Sections untouched', value: String(untouched.length), hint: 'Assigned, but nobody has opened them', tone: untouched.length ? 'normal' : 'quiet' })}
      </section>

      <section aria-labelledby="roster-heading" class="dash-section">
        <h2 id="roster-heading">Roster</h2>
        <div class="card table-wrap">
          <table class="data">
            <caption class="sr-only">Reading activity for each student in ${escapeHtml(course.code)}, ${escapeHtml(course.term_label)}</caption>
            <thead><tr><th scope="col">Student</th><th scope="col">Last active</th><th scope="col">Sections opened</th><th scope="col">Assigned read</th><th scope="col">Time on the book</th></tr></thead>
            <tbody>
              ${roster
                .map((s) => {
                  const share = assignedTotal ? s.assigned_read / assignedTotal : 0
                  return `<tr>
                    <th scope="row"><a href="${courseHref(course.id, s.student_hash)}">${escapeHtml(s.display_name)}</a></th>
                    <td class="tabular ${s.last_active ? '' : 'muted'}">${formatRelative(s.last_active)}</td>
                    <td class="tabular">${s.sections_opened}</td>
                    <td class="meter-cell"><span class="tabular small">${s.assigned_read} of ${assignedTotal} · ${percent(share)}</span><span class="meter" role="img" aria-label="${Math.round(share * 100)} percent of assigned reading"><span style="width:${Math.round(share * 100)}%"></span></span></td>
                    <td class="tabular">${formatDuration(s.dwell_seconds)}</td>
                  </tr>`
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="rollup-heading" class="dash-section">
        <h2 id="rollup-heading">Which sections landed</h2>
        <div class="card-grid">
          ${sectionList('Most read', mostRead)}
          ${sectionList('Least read', leastRead)}
        </div>
        ${
          untouched.length
            ? `<p class="muted dash-note">${untouched.length} assigned section${untouched.length === 1 ? ' has' : 's have'} no activity at all: ${untouched
                .slice(0, 4)
                .map((a) => escapeHtml(a.title || a.id))
                .join(', ')}${untouched.length > 4 ? ', and more' : ''}.</p>`
            : ''
        }
      </section>

      ${
        outliers.length
          ? `<section aria-labelledby="outliers-heading" class="dash-section">
              <h2 id="outliers-heading">Worth a conversation</h2>
              <p class="muted dash-note">Time on the book well away from the class median of ${formatDuration(median)}. Long is not necessarily bad and short is not necessarily bad. It is a prompt to ask, not a verdict.</p>
              <ul class="plain-list outlier-list">
                ${outliers
                  .map(
                    (s) => `<li class="card card--row"><a href="${courseHref(course.id, s.student_hash)}">${escapeHtml(s.display_name)}</a><span class="muted small tabular">${formatDuration(s.dwell_seconds)} · ${s.dwell_seconds > median ? 'well above' : 'well below'} median</span></li>`,
                  )
                  .join('')}
              </ul>
            </section>`
          : ''
      }`,
  )
}

async function renderStudent() {
  frame('<p class="libby-empty">Loading…</p>')
  let data
  try {
    data = await api(
      `/api/instructor/students/${encodeURIComponent(studentParam)}${courseParam ? `?course=${encodeURIComponent(courseParam)}` : ''}`,
    )
  } catch (error) {
    frame(
      emptyState(
        error.status === 404 ? 'No such student on your roster.' : 'Could not load this student.',
        `<p>${escapeHtml(error.message)} <a href="course">Back to the roster</a>.</p>`,
      ),
    )
    return
  }
  const { course, name, assigned, trail } = data
  const assignedIds = new Set(assigned)
  const dwell = trail.reduce((sum, row) => sum + row.dwell_seconds, 0)
  const finishedAssigned = trail.filter((row) => row.read > 0 && assignedIds.has(row.chunk_id))
  const lastActive = trail[0]?.last_active || null

  const header = `<p class="small"><a href="${courseHref(course.id)}">← ${escapeHtml(course.code)} roster</a></p>
    <header class="dash-head">
      <h1>${escapeHtml(name)}</h1>
      <p class="dash-lede">${escapeHtml(course.code)} · ${escapeHtml(course.term_label)}</p>
    </header>`

  if (!trail.length) {
    frame(
      header +
        emptyState(
          `${escapeHtml(name)} has not opened the book this term.`,
          '<p>Nothing has been recorded, so there is nothing to show. This is the real state, not a loading placeholder.</p>',
        ),
    )
    return
  }

  frame(
    header +
      `<section class="stat-grid" aria-label="Totals">
        ${statTile({ label: 'Last active', value: formatRelative(lastActive) })}
        ${statTile({ label: 'Sections opened', value: String(trail.length) })}
        ${statTile({ label: 'Assigned finished', value: `${finishedAssigned.length} of ${assigned.length}` })}
        ${statTile({ label: 'Time on the book', value: formatDuration(dwell) })}
      </section>
      <section class="dash-section" aria-labelledby="trail-heading">
        <h2 id="trail-heading">Section by section</h2>
        <div class="card table-wrap">
          <table class="data">
            <caption class="sr-only">Every section ${escapeHtml(name)} opened, most recent first</caption>
            <thead><tr><th scope="col">Section</th><th scope="col">Set as reading</th><th scope="col">Opens</th><th scope="col">Finished</th><th scope="col">Time</th><th scope="col">Last seen</th></tr></thead>
            <tbody>
              ${trail
                .map(
                  (row) => `<tr>
                    <th scope="row">${sectionLink(course.book_id, row)}</th>
                    <td class="muted">${assignedIds.has(row.chunk_id) ? 'Yes' : '—'}</td>
                    <td class="tabular">${row.opened}${row.reread > 0 ? `<span class="muted"> (+${row.reread} return)</span>` : ''}</td>
                    <td>${row.read > 0 ? 'Yes' : '—'}</td>
                    <td class="tabular">${formatDuration(row.dwell_seconds)}</td>
                    <td class="tabular muted">${formatRelative(row.last_active)}</td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>`,
  )
}

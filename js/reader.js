import * as pdfjsLib from '../vendor/pdfjs/pdf.mjs'
import { getBook } from './data.js'
import { icons } from './icons.js'
import { openSheet, renderLibby } from './chrome.js'
import { flush, logEvent } from './ledger.js'
import { session } from './session.js'
import { downloadHref, escapeHtml, qs, titleHref } from './util.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.mjs', import.meta.url).href

// Four verbs, and each one means something a professor could defend:
//   opened   the section was displayed
//   reread   the section was displayed and this student had opened it before
//   dwelled  fifteen seconds of attention, only while the tab is visible
//   read     they reached the last page of the section and spent at least a
//            quarter of the estimated reading time on it
const DWELL_TICK_MS = 15000
const WORDS_PER_MINUTE = 220
const READ_FRACTION = 0.25

const id = qs('id')
const book = getBook(id)
const requestedPage = Math.max(0, Number(qs('page') || '0') || 0)
const canLog = Boolean(session.person && session.person.role === 'student' && session.course)
const guestKey = book ? `zibili-pos-${book.id}` : ''

if (!book || !book.pdf) {
  renderLibby(
    `<div class="libby-empty"><p>We couldn’t find a file for that title.</p><a href="index.html">Back to the library</a></div>`,
    { title: 'Read', backHref: id ? titleHref(id) : 'index.html' },
  )
} else {
  paint()
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function guestPosition() {
  try {
    const value = Number(localStorage.getItem(guestKey))
    return value > 0 ? value : 0
  } catch {
    return 0
  }
}

function rememberGuestPosition(page) {
  try {
    localStorage.setItem(guestKey, String(page))
  } catch {
    // Storage disabled. Nothing to remember.
  }
}

function readerNote() {
  if (canLog) return ''
  if (!session.person) {
    return `<p class="reader-note">Reading as a guest. Your place isn’t saved between devices. <a href="menu.html">Sign in from Menu</a> to keep it.</p>`
  }
  return `<p class="reader-note">Signed in as ${escapeHtml(session.person.role)}. Reading isn’t recorded for you.</p>`
}

async function paint() {
  renderLibby(
    `<div class="reader">
      <div class="reader-toolbar" role="toolbar" aria-label="Reader">
        <button type="button" class="reader-btn" data-contents aria-label="Contents" aria-haspopup="dialog">${icons.list}</button>
        <button type="button" class="reader-btn" data-prev aria-label="Previous page">${icons.back}</button>
        <label class="reader-page">
          <input type="number" min="1" value="${requestedPage || 1}" data-page aria-label="Page">
          <span data-of>of …</span>
        </label>
        <button type="button" class="reader-btn reader-btn-next" data-next aria-label="Next page">${icons.back}</button>
        <span class="reader-spacer"></span>
        <button type="button" class="reader-btn" data-zoom-out aria-label="Zoom out">−</button>
        <button type="button" class="reader-btn" data-zoom-in aria-label="Zoom in">+</button>
      </div>
      <p class="reader-crumb" data-crumb aria-live="polite" hidden></p>
      ${readerNote()}
      <div class="reader-stage"><p class="reader-status">Opening ${escapeHtml(book.title)}…</p></div>
    </div>`,
    {
      title: book.title,
      backHref: titleHref(book.id),
      rightHTML: `<a class="icon-btn" href="${escapeHtml(downloadHref(book))}" download="${escapeHtml(book.id)}.pdf" aria-label="Download">${icons.download}</a>`,
    },
  )

  const stage = document.querySelector('.reader-stage')
  const pageInput = document.querySelector('[data-page]')
  const ofLabel = document.querySelector('[data-of]')
  const crumb = document.querySelector('[data-crumb]')
  let pdf = null
  let pageNumber = 1
  let zoom = 1
  let renderToken = 0
  let outline = null
  let flat = []

  // Tracker state for the section on screen.
  const openedBefore = new Set()
  let current = null // { section, dwell, reachedEnd, readSent }

  document.querySelector('[data-prev]').addEventListener('click', () => showPage(pageNumber - 1))
  document.querySelector('[data-next]').addEventListener('click', () => showPage(pageNumber + 1))
  document.querySelector('[data-zoom-in]').addEventListener('click', () => {
    zoom = Math.min(2.5, zoom + 0.25)
    showPage(pageNumber)
  })
  document.querySelector('[data-zoom-out]').addEventListener('click', () => {
    zoom = Math.max(0.5, zoom - 0.25)
    showPage(pageNumber)
  })
  document.querySelector('[data-contents]').addEventListener('click', openContents)
  pageInput.addEventListener('change', () => showPage(Number(pageInput.value) || 1))
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.target.closest('input, textarea, select, [contenteditable]')) return
    if (document.querySelector('.sheet-scrim')) return
    if (event.key === 'ArrowRight' || event.key === 'PageDown') showPage(pageNumber + 1)
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') showPage(pageNumber - 1)
  })

  const [sections, progress] = await Promise.all([
    fetchJson(`/api/books/${encodeURIComponent(book.id)}/sections`),
    canLog ? fetchJson(`/api/books/${encodeURIComponent(book.id)}/progress`) : Promise.resolve(null),
  ])
  outline = sections
  flat = outline ? outline.chapters.flatMap((c) => c.sections.map((s) => ({ ...s, chapter: c }))) : []
  for (const sectionId of progress?.opened || []) openedBefore.add(sectionId)
  pageNumber = requestedPage || progress?.position?.page || (canLog ? 0 : guestPosition()) || 1
  pageInput.value = String(pageNumber)
  updateCrumb()

  pdfjsLib
    .getDocument({
      url: book.pdf,
      disableRange: false,
      disableStream: false,
      rangeChunkSize: 65536,
    })
    .promise.then((doc) => {
      pdf = doc
      ofLabel.textContent = `of ${doc.numPages}`
      pageInput.max = String(doc.numPages)
      return showPage(pageNumber)
    })
    .catch((error) => {
      stage.innerHTML = `<p class="reader-status">Could not open this PDF. ${escapeHtml(error.message || '')}</p>`
    })

  if (canLog) {
    setInterval(() => {
      if (document.visibilityState !== 'visible' || !current) return
      current.dwell += DWELL_TICK_MS / 1000
      logEvent({
        ...eventBase(current.section),
        verb: 'dwelled',
        payload: { ...sectionPayload(current.section), page: pageNumber, seconds: DWELL_TICK_MS / 1000 },
      })
      maybeRead()
    }, DWELL_TICK_MS)
    window.addEventListener('pagehide', () => flush(true))
  }

  function eventBase(section) {
    return { book_id: book.id, chunk_ids: [section.id] }
  }

  function sectionPayload(section) {
    return { chapter: section.chapter.number, section: section.number, words: section.words }
  }

  function readingSeconds(words) {
    return Math.max(30, Math.round((words / WORDS_PER_MINUTE) * 60))
  }

  function maybeRead() {
    if (!current || current.readSent || !current.reachedEnd) return
    const threshold = Math.max(10, Math.round(readingSeconds(current.section.words) * READ_FRACTION))
    if (current.dwell < threshold) return
    current.readSent = true
    logEvent({
      ...eventBase(current.section),
      verb: 'read',
      payload: { ...sectionPayload(current.section), page: pageNumber, seconds: current.dwell, threshold },
    })
  }

  function track(page) {
    if (!canLog) {
      rememberGuestPosition(page)
      return
    }
    const section = sectionFor(page)
    if (!section) {
      current = null
      return
    }
    if (!current || current.section.id !== section.id) {
      current = { section, dwell: 0, reachedEnd: false, readSent: false }
      logEvent({ ...eventBase(section), verb: 'opened', payload: { ...sectionPayload(section), page } })
      if (openedBefore.has(section.id)) {
        logEvent({ ...eventBase(section), verb: 'reread', payload: { ...sectionPayload(section), page } })
      }
      openedBefore.add(section.id)
    }
    if (page >= section.end_page) {
      current.reachedEnd = true
      maybeRead()
    }
  }

  function sectionFor(page) {
    return flat.find((s) => page >= s.start_page && page <= s.end_page) || null
  }

  function updateCrumb() {
    const section = sectionFor(pageNumber)
    if (section) {
      crumb.textContent = `${section.number ? `${section.number} ` : ''}${section.title}`
      crumb.hidden = false
    } else if (outline && outline.outline === 'none') {
      crumb.textContent = 'This PDF has no chapter outline.'
      crumb.hidden = false
    } else {
      crumb.textContent = ''
      crumb.hidden = true
    }
  }

  function openContents() {
    if (!outline || !flat.length || outline.outline === 'none') {
      openSheet(
        `<button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
         <p class="sheet-kicker">Contents</p>
         <p class="libby-empty">${outline ? 'This PDF has no chapter outline.' : 'Contents are not available right now.'}</p>`,
        { label: 'Contents' },
      )
      return
    }
    const here = sectionFor(pageNumber)
    const html = outline.chapters
      .map(
        (chapter) => `<section class="toc-chapter">
          <h3>${chapter.number ? `${chapter.number}. ` : ''}${escapeHtml(chapter.title)}</h3>
          <ul>
            ${chapter.sections
              .map(
                (s) => `<li><button type="button" data-goto="${s.start_page}" ${
                  here && here.id === s.id ? 'aria-current="true" class="is-current"' : ''
                }>${s.number ? `<span class="toc-number">${escapeHtml(s.number)}</span>` : ''}${escapeHtml(s.title)}<span class="toc-page">p. ${s.start_page}</span></button></li>`,
              )
              .join('')}
          </ul>
        </section>`,
      )
      .join('')
    const sheet = openSheet(
      `<button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
       <p class="sheet-kicker">Contents</p>
       <nav class="toc" aria-label="Contents">${html}</nav>`,
      { label: 'Contents' },
    )
    sheet.querySelector('.sheet').classList.add('sheet--toc')
    sheet.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' })
    sheet.querySelectorAll('[data-goto]').forEach((btn) =>
      btn.addEventListener('click', () => {
        sheet.close()
        showPage(Number(btn.dataset.goto))
      }),
    )
  }

  async function showPage(next) {
    if (!pdf) return
    pageNumber = Math.min(pdf.numPages, Math.max(1, next))
    pageInput.value = String(pageNumber)
    updateCrumb()
    const token = ++renderToken
    const page = await pdf.getPage(pageNumber)
    if (token !== renderToken) return
    const base = page.getViewport({ scale: 1 })
    const fit = Math.max(0.4, (stage.clientWidth - 32) / base.width)
    const viewport = page.getViewport({ scale: fit * zoom })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { alpha: false })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', `Page ${pageNumber} of ${pdf.numPages}`)
    await page.render({ canvasContext: context, viewport }).promise
    if (token !== renderToken) return
    stage.replaceChildren(canvas)
    const url = new URL(location.href)
    url.searchParams.set('id', book.id)
    url.searchParams.set('page', String(pageNumber))
    history.replaceState(null, '', url)
    track(pageNumber)
  }
}

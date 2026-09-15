import * as pdfjsLib from '../vendor/pdfjs/pdf.mjs'
import { getBook } from './data.js'
import { icons } from './icons.js'
import { openSheet, renderLibby } from './chrome.js'
import { flush, logEvent } from './ledger.js'
import { session } from './session.js'
import { downloadHref, escapeHtml, qs, titleHref } from './util.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.mjs', import.meta.url).href

// The reader is one long document: a placeholder per page, sized before any
// page is drawn so the scrollbar is honest from the first paint, and pages
// rendered as they come into view. The window is the scroller, which is what
// the sticky header, toolbar and tab bar already assume.
//
// Four verbs, and each one means something a professor could defend:
//   opened   the section was displayed (and stayed for at least a moment)
//   reread   the section was displayed and this student had opened it before
//   dwelled  fifteen seconds of attention, only while the tab is visible
//   read     they reached the last page of the section and spent at least a
//            quarter of the estimated reading time on it
const DWELL_TICK_MS = 15000
const WORDS_PER_MINUTE = 220
const READ_FRACTION = 0.25

const MAX_CONCURRENT = 2
const MAX_RENDERED = 12
const TRACK_DEBOUNCE_MS = 300
const URL_THROTTLE_MS = 1000
const CRUMB_THROTTLE_MS = 500
const MAX_CANVAS_PIXELS = 16777216

const FORMATS = [
  { id: 'read', label: 'Read', icon: 'book' },
  { id: 'listen', label: 'Listen', icon: 'headphones', copy: 'Listen would read this section aloud and highlight each sentence as it is spoken. Not in v1.' },
  { id: 'summary', label: 'Summary', icon: 'summary', copy: 'Summary would give you a short, plain-language version of the assigned pages. Not in v1.' },
  { id: 'infographic', label: 'Infographic', icon: 'college', copy: 'Infographic would lay out the section’s key ideas as one picture. Not in v1.' },
  { id: 'story', label: 'Story', icon: 'story', copy: 'Story would carry the section’s concepts through a short narrative. Not in v1.' },
  { id: 'cards', label: 'Cards', icon: 'card', copy: 'Cards would turn this section into flashcards for spaced review. Not in v1.' },
  { id: 'quiz', label: 'Quiz', icon: 'quiz', copy: 'Quiz would give you eight to ten faculty-reviewed questions on this section, with explanations. Not in v1.' },
  { id: 'ask', label: 'Ask', icon: 'ask', copy: 'Ask would let you put a question to a tutor that knows this section and the ones before it. Not in v1.' },
]

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

function formatWheel() {
  return `<div class="format-wheel chip-row" role="group" aria-label="Format">
    ${FORMATS.map((f) =>
      f.id === 'read'
        ? `<button type="button" class="chip is-on" data-format="read" aria-current="true">${icons[f.icon]}<span>${f.label}</span></button>`
        : `<button type="button" class="chip" data-format="${f.id}" aria-haspopup="dialog">${icons[f.icon]}<span>${f.label}</span></button>`,
    ).join('')}
  </div>`
}

function isCancelled(error) {
  return error instanceof pdfjsLib.RenderingCancelledException || error?.name === 'RenderingCancelledException'
}

async function paint() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

  renderLibby(
    `<div class="reader">
      <div class="reader-toolbar" role="toolbar" aria-label="Reader">
        <button type="button" class="reader-btn" data-contents aria-label="Contents" aria-haspopup="dialog">${icons.list}</button>
        <button type="button" class="reader-btn" data-prev aria-label="Previous page">${icons.back}</button>
        <label class="reader-pager">
          <input type="number" min="1" value="${requestedPage || 1}" data-page-input aria-label="Page">
          <span data-of>of …</span>
        </label>
        <button type="button" class="reader-btn reader-btn-next" data-next aria-label="Next page">${icons.back}</button>
        <span class="reader-spacer"></span>
        <button type="button" class="reader-btn" data-zoom-out aria-label="Zoom out">−</button>
        <button type="button" class="reader-btn" data-zoom-in aria-label="Zoom in">+</button>
      </div>
      ${formatWheel()}
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
  const toolbar = document.querySelector('.reader-toolbar')
  const tabbar = document.querySelector('.libby-tabbar')
  const pageInput = document.querySelector('[data-page-input]')
  const ofLabel = document.querySelector('[data-of]')
  const crumb = document.querySelector('[data-crumb]')

  let pdf = null
  let numPages = 0
  let zoom = 1
  let scale = 1
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let baseSize = { width: 612, height: 792 }
  const sizes = []
  let layout = []
  let holders = []
  let layoutToken = 0
  const wanted = new Set()
  const rendered = new Map()
  const active = new Map()
  let observer = null
  let pageNumber = requestedPage || 1
  let lastWidth = 0
  let scrollRaf = 0
  let trackTimer = null
  let urlTimer = null
  let crumbTimer = null
  let resizeTimer = null
  let crumbSectionId = null
  let outline = null
  let flat = []

  // Tracker state for the section on screen.
  const openedBefore = new Set()
  let current = null // { section, dwell, reachedEnd, readSent }

  document.querySelector('[data-prev]').addEventListener('click', () => showPage(pageNumber - 1))
  document.querySelector('[data-next]').addEventListener('click', () => showPage(pageNumber + 1))
  document.querySelector('[data-zoom-in]').addEventListener('click', () => {
    zoom = Math.min(2.5, zoom + 0.25)
    relayout()
  })
  document.querySelector('[data-zoom-out]').addEventListener('click', () => {
    zoom = Math.max(0.5, zoom - 0.25)
    relayout()
  })
  document.querySelector('[data-contents]').addEventListener('click', openContents)
  document.querySelectorAll('.format-wheel [data-format]').forEach((btn) =>
    btn.addEventListener('click', () => openFormat(btn.dataset.format)),
  )
  pageInput.addEventListener('change', () => showPage(Number(pageInput.value) || 1))
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.target.closest('input, textarea, select, [contenteditable]')) return
    if (document.querySelector('.sheet-scrim')) return
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault()
      showPage(pageNumber + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      showPage(pageNumber - 1)
    }
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

  try {
    pdf = await pdfjsLib.getDocument({
      url: book.pdf,
      disableRange: false,
      disableStream: false,
      rangeChunkSize: 65536,
    }).promise
  } catch (error) {
    stage.innerHTML = `<p class="reader-status">Could not open this PDF. ${escapeHtml(error.message || '')}</p>`
    return
  }
  numPages = pdf.numPages
  pageNumber = Math.min(numPages, Math.max(1, pageNumber))
  ofLabel.textContent = `of ${numPages}`
  pageInput.max = String(numPages)

  const landing = await pdf.getPage(pageNumber)
  const landingView = landing.getViewport({ scale: 1 })
  baseSize = { width: landingView.width, height: landingView.height }
  sizes[pageNumber] = baseSize

  buildStage()
  scale = fitScale() * zoom
  layoutPages()
  scrollToPage(pageNumber)
  observe()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (stage.clientWidth !== lastWidth) relayout()
    }, 150)
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

  // --- layout and rendering ------------------------------------------------

  function buildStage() {
    holders = []
    const fragment = document.createDocumentFragment()
    for (let n = 1; n <= numPages; n += 1) {
      const holder = document.createElement('div')
      holder.className = 'reader-page'
      holder.dataset.page = String(n)
      holder.innerHTML = `<span class="reader-page-num" aria-hidden="true">${n}</span>`
      holders[n] = holder
      fragment.append(holder)
    }
    stage.replaceChildren(fragment)
  }

  function fitScale() {
    lastWidth = stage.clientWidth
    return Math.max(0.4, (stage.clientWidth - 32) / baseSize.width)
  }

  function layoutPages(from = 1) {
    for (let n = from; n <= numPages; n += 1) {
      const size = sizes[n] || baseSize
      holders[n].style.width = `${Math.floor(size.width * scale)}px`
      holders[n].style.height = `${Math.floor(size.height * scale)}px`
    }
    measure(from)
  }

  function measure(from = 1) {
    const stageTop = stage.getBoundingClientRect().top + window.scrollY
    for (let n = from; n <= numPages; n += 1) {
      layout[n] = { top: stageTop + holders[n].offsetTop, height: holders[n].offsetHeight }
    }
  }

  function correctSize(n, page) {
    const view = page.getViewport({ scale: 1 })
    const known = sizes[n]
    if (known && known.width === view.width && known.height === view.height) return
    sizes[n] = { width: view.width, height: view.height }
    const before = layout[n]?.height || 0
    holders[n].style.width = `${Math.floor(view.width * scale)}px`
    holders[n].style.height = `${Math.floor(view.height * scale)}px`
    const after = holders[n].offsetHeight
    const delta = after - before
    if (delta !== 0 && layout[n] && layout[n].top < window.scrollY) {
      window.scrollBy({ top: delta, behavior: 'instant' })
    }
    if (delta !== 0) measure(n)
  }

  function readingBand() {
    const top = toolbar.getBoundingClientRect().bottom
    const tabbarShown = tabbar && getComputedStyle(tabbar).display !== 'none'
    const bottom = tabbarShown ? tabbar.getBoundingClientRect().top : window.innerHeight
    return { top, bottom: Math.max(bottom, top + 1) }
  }

  function observe() {
    observer?.disconnect()
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number(entry.target.dataset.page)
          if (entry.isIntersecting) wanted.add(n)
          else wanted.delete(n)
        }
        pump()
      },
      { root: null, rootMargin: '100% 0px', threshold: 0 },
    )
    for (let n = 1; n <= numPages; n += 1) observer.observe(holders[n])
  }

  function pump() {
    while (active.size < MAX_CONCURRENT) {
      let best = 0
      let bestDistance = Infinity
      for (const n of wanted) {
        if (rendered.has(n) || active.has(n)) continue
        const distance = Math.abs(n - pageNumber)
        if (distance < bestDistance) {
          best = n
          bestDistance = distance
        }
      }
      if (!best) break
      renderPage(best)
    }
    evict()
  }

  async function renderPage(n) {
    const token = layoutToken
    active.set(n, null)
    let task = null
    try {
      const page = await pdf.getPage(n)
      if (token !== layoutToken) return
      correctSize(n, page)
      const viewport = page.getViewport({ scale })
      let ratio = dpr
      if (viewport.width * viewport.height * ratio * ratio > MAX_CANVAS_PIXELS) {
        ratio = Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height))
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      const context = canvas.getContext('2d', { alpha: false })
      task = page.render({
        canvasContext: context,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
      })
      active.set(n, task)
      await task.promise
      if (token !== layoutToken) return
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', `Page ${n} of ${numPages}`)
      const holder = holders[n]
      holder.querySelector('.reader-page-num')?.remove()
      holder.querySelector('.reader-page-error')?.remove()
      holder.append(canvas)
      rendered.set(n, { canvas, lastUsed: Date.now() })
    } catch (error) {
      if (!isCancelled(error) && token === layoutToken) {
        const holder = holders[n]
        if (!holder.querySelector('.reader-page-error')) {
          holder.insertAdjacentHTML('beforeend', '<p class="reader-page-error">This page did not render. Scroll away and back to retry.</p>')
        }
      }
    } finally {
      active.delete(n)
      if (token === layoutToken) pump()
    }
  }

  function cancel(n) {
    const task = active.get(n)
    try {
      task?.cancel()
    } catch {
      // already finished
    }
    active.delete(n)
  }

  function release(n) {
    const entry = rendered.get(n)
    if (!entry) return
    entry.canvas.width = 0
    entry.canvas.height = 0
    entry.canvas.remove()
    rendered.delete(n)
    const holder = holders[n]
    if (!holder.querySelector('.reader-page-num')) {
      holder.insertAdjacentHTML('afterbegin', `<span class="reader-page-num" aria-hidden="true">${n}</span>`)
    }
  }

  function evict() {
    for (const n of [...active.keys()]) {
      if (!wanted.has(n)) cancel(n)
    }
    for (const n of wanted) {
      const entry = rendered.get(n)
      if (entry) entry.lastUsed = Date.now()
    }
    if (rendered.size <= MAX_RENDERED) return
    const spare = [...rendered.entries()].filter(([n]) => !wanted.has(n)).sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    for (const [n] of spare) {
      if (rendered.size <= MAX_RENDERED) break
      release(n)
    }
  }

  function relayout() {
    if (!pdf || !holders.length) return
    layoutToken += 1
    for (const n of [...active.keys()]) cancel(n)
    for (const n of [...rendered.keys()]) release(n)
    const band = readingBand()
    const here = layout[pageNumber]
    const frac = here ? Math.min(1, Math.max(0, (window.scrollY + band.top - here.top) / here.height)) : 0
    scale = fitScale() * zoom
    layoutPages()
    scrollToPage(pageNumber, frac)
    observe()
  }

  // --- current page -----------------------------------------------------------

  function onScroll() {
    if (!scrollRaf) {
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0
        updateCurrent()
      })
    }
  }

  function pageAt(y) {
    let lo = 1
    let hi = numPages
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (layout[mid].top + layout[mid].height + 16 < y) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  function updateCurrent() {
    if (!layout.length) return
    const band = readingBand()
    const middle = window.scrollY + (band.top + band.bottom) / 2
    const n = Math.min(numPages, Math.max(1, pageAt(middle)))
    if (n !== pageNumber) setCurrent(n)
  }

  function setCurrent(n) {
    pageNumber = n
    if (document.activeElement !== pageInput) pageInput.value = String(n)
    scheduleCrumb()
    scheduleUrl()
    scheduleTrack()
  }

  function scheduleTrack() {
    clearTimeout(trackTimer)
    trackTimer = setTimeout(() => track(pageNumber), TRACK_DEBOUNCE_MS)
  }

  function scheduleCrumb() {
    if (crumbTimer) return
    crumbTimer = setTimeout(() => {
      crumbTimer = null
      updateCrumb()
    }, CRUMB_THROTTLE_MS)
  }

  function scheduleUrl() {
    if (urlTimer) return
    urlTimer = setTimeout(() => {
      urlTimer = null
      const url = new URL(location.href)
      url.searchParams.set('id', book.id)
      url.searchParams.set('page', String(pageNumber))
      history.replaceState(null, '', url)
    }, URL_THROTTLE_MS)
  }

  function scrollToPage(n, frac = 0) {
    const target = layout[n]
    if (!target) return
    const band = readingBand()
    const top = Math.max(0, target.top + frac * target.height - band.top)
    window.scrollTo({ top, behavior: 'instant' })
    const here = pageAt(window.scrollY + (band.top + band.bottom) / 2)
    setCurrent(Math.min(numPages, Math.max(1, here)))
  }

  function showPage(next) {
    if (!pdf) return
    scrollToPage(Math.min(numPages, Math.max(1, next)))
  }

  // --- tracker ----------------------------------------------------------------

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
      if (crumbSectionId === section.id) return
      crumbSectionId = section.id
      crumb.textContent = `${section.number ? `${section.number} ` : ''}${section.title}`
      crumb.hidden = false
    } else if (outline && outline.outline === 'none') {
      crumbSectionId = 'none'
      crumb.textContent = 'This PDF has no chapter outline.'
      crumb.hidden = false
    } else {
      crumbSectionId = null
      crumb.textContent = ''
      crumb.hidden = true
    }
  }

  // --- drawers ----------------------------------------------------------------

  function openFormat(formatId) {
    const format = FORMATS.find((f) => f.id === formatId)
    if (!format || format.id === 'read') return
    openSheet(
      `<button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
       <p class="sheet-kicker">${format.label}</p>
       <p class="format-copy">${escapeHtml(format.copy)}</p>
       <p class="muted small">Read is the only format in this build. The others are listed so the reader is honest about what comes later; each one is a line in the project backlog.</p>`,
      { label: format.label },
    )
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
}

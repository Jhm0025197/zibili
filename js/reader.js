import * as pdfjsLib from '../vendor/pdfjs/pdf.mjs'
import { getBook } from './data.js'
import { icons } from './icons.js'
import { openSheet, renderLibby } from './chrome.js'
import { downloadHref, escapeHtml, qs, titleHref } from './util.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.mjs', import.meta.url).href

const id = qs('id')
const book = getBook(id)
const requestedPage = Math.max(0, Number(qs('page') || '0') || 0)

if (!book || !book.pdf) {
  renderLibby(
    `<div class="libby-empty"><p>We couldn’t find a file for that title.</p><a href="index.html">Back to the library</a></div>`,
    { title: 'Read', backHref: id ? titleHref(id) : 'index.html' },
  )
} else {
  paint()
}

async function loadSections() {
  try {
    const response = await fetch(`/api/books/${encodeURIComponent(book.id)}/sections`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function paint() {
  const startPage = requestedPage || 1
  renderLibby(
    `<div class="reader">
      <div class="reader-toolbar" role="toolbar" aria-label="Reader">
        <button type="button" class="reader-btn" data-contents aria-label="Contents" aria-haspopup="dialog">${icons.list}</button>
        <button type="button" class="reader-btn" data-prev aria-label="Previous page">${icons.back}</button>
        <label class="reader-page">
          <input type="number" min="1" value="${startPage}" data-page aria-label="Page">
          <span data-of>of …</span>
        </label>
        <button type="button" class="reader-btn reader-btn-next" data-next aria-label="Next page">${icons.back}</button>
        <span class="reader-spacer"></span>
        <button type="button" class="reader-btn" data-zoom-out aria-label="Zoom out">−</button>
        <button type="button" class="reader-btn" data-zoom-in aria-label="Zoom in">+</button>
      </div>
      <p class="reader-crumb" data-crumb aria-live="polite" hidden></p>
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
  let pageNumber = startPage
  let zoom = 1
  let renderToken = 0
  let outline = null
  let flat = []

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

  loadSections().then((data) => {
    outline = data
    flat = outline ? outline.chapters.flatMap((c) => c.sections.map((s) => ({ ...s, chapter: c }))) : []
    updateCrumb()
  })

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
         <p class="libby-empty">${outline ? 'This PDF has no chapter outline.' : 'Contents are still loading.'}</p>`,
        { label: 'Contents' },
      )
      return
    }
    const current = sectionFor(pageNumber)
    const html = outline.chapters
      .map(
        (chapter) => `<section class="toc-chapter">
          <h3>${chapter.number ? `${chapter.number}. ` : ''}${escapeHtml(chapter.title)}</h3>
          <ul>
            ${chapter.sections
              .map(
                (s) => `<li><button type="button" data-goto="${s.start_page}" ${
                  current && current.id === s.id ? 'aria-current="true" class="is-current"' : ''
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
  }
}

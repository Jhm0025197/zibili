import * as pdfjsLib from '../vendor/pdfjs/pdf.mjs'
import { getBook } from './data.js'
import { icons } from './icons.js'
import { renderLibby } from './chrome.js'
import { downloadHref, escapeHtml, qs, titleHref } from './util.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.mjs', import.meta.url).href

const id = qs('id')
const book = getBook(id)
const startPage = Math.max(1, Number(qs('page') || '1') || 1)

if (!book || !book.pdf) {
  renderLibby(
    `<div class="libby-empty"><p>We couldn’t find a file for that title.</p><a href="index.html">Keep browsing</a></div>`,
    { title: 'Read', backHref: id ? titleHref(id) : 'index.html' },
  )
} else {
  paint()
}

function paint() {
  renderLibby(
    `<div class="reader">
      <div class="reader-toolbar">
        <button type="button" class="reader-btn" data-prev aria-label="Previous page">${icons.back}</button>
        <label class="reader-page">
          <input type="number" min="1" value="${startPage}" data-page>
          <span data-of>of …</span>
        </label>
        <button type="button" class="reader-btn reader-btn-next" data-next aria-label="Next page">${icons.back}</button>
        <span class="reader-spacer"></span>
        <button type="button" class="reader-btn" data-zoom-out aria-label="Zoom out">−</button>
        <button type="button" class="reader-btn" data-zoom-in aria-label="Zoom in">+</button>
      </div>
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
  let pdf = null
  let pageNumber = startPage
  let zoom = 1
  let renderToken = 0

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
  pageInput.addEventListener('change', () => showPage(Number(pageInput.value) || 1))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') showPage(pageNumber + 1)
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') showPage(pageNumber - 1)
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

  async function showPage(next) {
    if (!pdf) return
    pageNumber = Math.min(pdf.numPages, Math.max(1, next))
    pageInput.value = String(pageNumber)
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
    await page.render({ canvasContext: context, viewport }).promise
    if (token !== renderToken) return
    stage.replaceChildren(canvas)
    const url = new URL(location.href)
    url.searchParams.set('id', book.id)
    url.searchParams.set('page', String(pageNumber))
    history.replaceState(null, '', url)
  }
}

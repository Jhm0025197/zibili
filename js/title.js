import { getBook, relatedBooks } from './data.js'
import { icons } from './icons.js'
import { renderLibby } from './chrome.js'
import { flash, lib } from './state.js'
import { bindCovers, coverHTML, downloadHref, escapeHtml, hasPdf, qs, readHref, titleHref } from './util.js'

const book = getBook(qs('id'))

if (!book) {
  renderLibby(
    `<div class="libby-empty"><p>We couldn’t find that title.</p><a href="index.html">Back to the library</a></div>`,
    { title: 'Title', backHref: 'index.html' },
  )
} else {
  paint()
}

function paint() {
  const tagged = lib.hasTag(book.id)
  const readable = hasPdf(book)
  const related = relatedBooks(book)

  renderLibby(
    `<article class="title-page">
      <div class="title-hero">
        <div class="title-covers">
          ${coverHTML(book, { className: 'title-main-cover' })}
        </div>
        <div class="title-actions">
          ${
            readable
              ? `<a class="libby-action" href="${readHref(book.id)}" data-primary>${icons.book}<span>Read</span></a>
                 <a class="libby-action" href="${escapeHtml(downloadHref(book))}" download="${escapeHtml(book.id)}.pdf">${icons.download}<span>Download</span></a>`
              : `<p class="wait-note">No file is attached to this title yet.</p>`
          }
          <button type="button" class="libby-action ${tagged ? 'is-on' : ''}" data-tag aria-pressed="${tagged}">${icons.tag}<span>${tagged ? 'Tagged' : 'Tag'}</span></button>
        </div>
      </div>
      <header class="title-meta">
        <h2>${escapeHtml(book.title)}</h2>
        <p class="byline">
          <a href="list.html?q=${encodeURIComponent(book.author)}">${escapeHtml(book.author)}</a>
        </p>
      </header>
      ${book.quote ? `<blockquote class="title-quote">${escapeHtml(book.quote)}</blockquote>` : ''}
      <div class="blurb">${book.description
        .split('\n')
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join('')}</div>
      ${book.description.length > 400 ? '<button type="button" class="more-btn" aria-expanded="false">more</button>' : ''}
      ${readable ? '<section class="chapters" aria-labelledby="chapters-heading" data-chapters hidden><h3 id="chapters-heading">Chapters</h3><ol class="chapter-list"></ol></section>' : ''}
      <section class="about-block" aria-labelledby="about-heading">
        <h3 id="about-heading">About this book</h3>
        <dl>
          <dt>Pages</dt><dd>${book.pages}</dd>
          ${book.released ? `<dt>Released</dt><dd>${escapeHtml(book.released)}</dd>` : ''}
          ${book.publisher ? `<dt>Publisher</dt><dd>${escapeHtml(book.publisher)}</dd>` : ''}
          ${book.isbn13 ? `<dt>ISBN</dt><dd>${escapeHtml(book.isbn13)}</dd>` : ''}
          <dt>Language</dt><dd>${escapeHtml(book.language)}</dd>
          ${book.license ? `<dt>License</dt><dd>${escapeHtml(book.license)}</dd>` : ''}
          ${(book.course_codes || []).length ? `<dt>Course</dt><dd>${escapeHtml(book.course_codes.join(', '))}</dd>` : ''}
        </dl>
      </section>
      ${
        (book.subjects || []).length
          ? `<section class="subjects" aria-labelledby="subjects-heading">
              <h3 id="subjects-heading">Subjects</h3>
              <div class="subject-row">${book.subjects.map((s) => `<a href="list.html?q=${encodeURIComponent(s)}">${escapeHtml(s)}</a>`).join('')}</div>
            </section>`
          : ''
      }
      ${
        related.length
          ? `<section class="also-row" aria-labelledby="also-heading">
              <h3 id="also-heading">Also in the library</h3>
              <div class="libby-rail-books">
                ${related.map((b) => `<a href="${titleHref(b.id)}" class="mini-cover">${coverHTML(b)}<span>${escapeHtml(b.title)}</span></a>`).join('')}
              </div>
            </section>`
          : ''
      }
    </article>`,
    {
      title: 'Title',
      backHref: 'index.html',
      rightHTML: `<button type="button" class="icon-btn" aria-label="Copy link" data-share>${icons.share}</button>`,
    },
  )

  document.querySelector('[data-share]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      flash('Link copied')
    } catch {
      flash('Copy the address bar to share this title')
    }
  })
  const blurb = document.querySelector('.blurb')
  document.querySelector('.more-btn')?.addEventListener('click', (e) => {
    const open = blurb.classList.toggle('is-open')
    e.target.textContent = open ? 'less' : 'more'
    e.target.setAttribute('aria-expanded', String(open))
  })
  document.querySelector('[data-tag]')?.addEventListener('click', (e) => {
    const on = lib.toggleTag(book.id)
    const btn = e.currentTarget
    btn.classList.toggle('is-on', on)
    btn.setAttribute('aria-pressed', String(on))
    btn.querySelector('span').textContent = on ? 'Tagged' : 'Tag'
    flash(on ? 'Tagged. Find it on your Shelf.' : 'Tag removed')
  })

  if (readable) loadChapters()
  bindCovers()
}

async function loadChapters() {
  const section = document.querySelector('[data-chapters]')
  try {
    const response = await fetch(`/api/books/${encodeURIComponent(book.id)}/sections`, { headers: { Accept: 'application/json' } })
    if (!response.ok) return
    const outline = await response.json()
    if (!outline.chapters.length || outline.outline === 'none') return
    section.querySelector('ol').innerHTML = outline.chapters
      .map(
        (c) => `<li><a href="${readHref(book.id, c.start_page)}">${c.number ? `${c.number}. ` : ''}${escapeHtml(c.title)}</a><span class="chapter-meta">${c.sections.length} section${c.sections.length === 1 ? '' : 's'} · p. ${c.start_page}</span></li>`,
      )
      .join('')
    section.hidden = false
  } catch {
    // The chapter list is a convenience; the Read button still works.
  }
}

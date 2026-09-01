import { getBook, relatedBooks } from './data.js'
import { icons } from './icons.js'
import { openSheet, renderLibby } from './chrome.js'
import { lib } from './state.js'
import { bindCovers, coverHTML, escapeHtml, qs, titleHref } from './util.js'

const book = getBook(qs('id'))

if (!book) {
  renderLibby(
    `<div class="libby-empty"><p>We couldn’t find that title.</p><a href="index.html">Keep browsing</a></div>`,
    { title: 'Title', backHref: 'index.html' },
  )
} else {
  paint(0)
}

function paint(formatIndex) {
  const format = book.formats[Math.min(formatIndex, book.formats.length - 1)]
  const loaned = lib.isLoaned(book.id, format.type)
  const held = lib.isHeld(book.id, format.type)
  const tagged = lib.hasTag(book.id)
  const waitersPerCopy = format.holds && format.copies ? (format.holds / format.copies).toFixed(1) : null
  const actionLabel = loaned ? 'Open' : format.available ? 'Borrow' : held ? 'Manage Hold' : 'Place Hold'
  const sampleLabel = format.type === 'audiobook' ? 'Listen to Sample' : 'Read Sample'
  const related = relatedBooks(book)
  const full = Math.round(book.rating || 0)

  renderLibby(
    `<article class="title-page">
      <div class="title-hero">
        <div class="title-covers">
          ${coverHTML(book, { format: format.type, showBadge: true, className: 'title-main-cover' })}
          ${
            book.formats.length > 1
              ? `<div class="format-switch">
                  ${book.formats
                    .map(
                      (f, i) =>
                        `<button type="button" class="format-chip-btn ${i === formatIndex ? 'is-active' : ''}" data-fmt="${i}">${f.type === 'audiobook' ? icons.headphones : icons.card}${f.type}</button>`,
                    )
                    .join('')}
                </div>`
              : ''
          }
        </div>
        <div class="title-actions">
          <button type="button" class="libby-action" data-primary>${format.available || loaned ? icons.card : icons.clock}<span>${actionLabel}</span></button>
          <button type="button" class="libby-action" data-sample>${icons.play}<span>${sampleLabel}</span></button>
          <button type="button" class="libby-action ${tagged ? 'is-on' : ''}" data-tag>${icons.tag}<span>${tagged ? 'Tagged' : 'Tag'}</span></button>
          ${
            !format.available
              ? `<p class="wait-note">${escapeHtml(format.wait || '')} · ${format.copies} cop${format.copies === 1 ? 'y' : 'ies'} · ${format.holds} people waiting${waitersPerCopy ? ` · ${waitersPerCopy} per copy` : ''}</p>`
              : ''
          }
          ${loaned ? `<p class="wait-note">On your shelf — due in ${lib.loans.find((l) => l.bookId === book.id)?.days || 14} days.</p>` : ''}
        </div>
      </div>
      <header class="title-meta">
        ${book.series ? `<p class="series-line">${escapeHtml(book.series.name)} #${book.series.position}</p>` : ''}
        <h2>${escapeHtml(book.title)}</h2>
        <p class="byline">
          <a href="index.html?q=${encodeURIComponent(book.author)}">${escapeHtml(book.author)}</a>
          ${format.narrator ? ` · narrated by <a href="index.html?q=${encodeURIComponent(format.narrator)}">${escapeHtml(format.narrator)}</a>` : ''}
        </p>
        <p class="rating-line">
          <span class="stars" aria-label="${book.rating} out of 5 stars">${[0, 1, 2, 3, 4].map((i) => icons.star(i < full)).join('')}</span>
          <strong>${book.rating.toFixed(1)}</strong>
          <span>${book.ratingsCount.toLocaleString()} ratings</span>
        </p>
      </header>
      ${book.quote ? `<blockquote class="title-quote">${escapeHtml(book.quote)}</blockquote>` : ''}
      <div class="blurb">${book.description.split('\n').map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</div>
      <button type="button" class="more-btn">more</button>
      <section class="about-block">
        <h3>About this ${escapeHtml(format.type)}</h3>
        <dl>
          ${format.type === 'ebook' ? `<dt>Pages</dt><dd>${book.pages}</dd>` : ''}
          ${format.duration ? `<dt>Duration</dt><dd>${escapeHtml(format.duration)}</dd>` : ''}
          <dt>Released</dt><dd>${escapeHtml(book.released)}</dd>
          <dt>Publisher</dt><dd>${escapeHtml(book.publisher)}</dd>
          <dt>ISBN</dt><dd>${escapeHtml(book.isbn13)}</dd>
          <dt>Language</dt><dd>${escapeHtml(book.language)}</dd>
          <dt>Audience</dt><dd class="cap">${escapeHtml(book.audience)}</dd>
        </dl>
      </section>
      <section class="subjects">
        <h3>Subjects</h3>
        <div class="subject-row">${book.subjects.map((s) => `<a href="index.html?q=${encodeURIComponent(s)}">${escapeHtml(s)}</a>`).join('')}</div>
      </section>
      <section class="also-row">
        <h3>Readers also borrowed</h3>
        <div class="libby-rail-books">
          ${related.map((b) => `<a href="${titleHref(b.id)}" class="mini-cover">${coverHTML(b)}<span>${escapeHtml(b.title)}</span></a>`).join('')}
        </div>
      </section>
    </article>`,
    {
      title: 'Popular',
      backHref: 'index.html',
      rightHTML: `<button type="button" class="icon-btn" aria-label="Share" data-share>${icons.share}</button>`,
    },
  )

  document.querySelector('[data-share]')?.addEventListener('click', () => navigator.clipboard?.writeText(location.href))
  document.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => paint(Number(b.dataset.fmt))))
  const blurb = document.querySelector('.blurb')
  document.querySelector('.more-btn')?.addEventListener('click', (e) => {
    blurb.classList.toggle('is-open')
    e.target.textContent = blurb.classList.contains('is-open') ? 'less' : 'more'
  })
  document.querySelector('[data-tag]')?.addEventListener('click', () => {
    lib.toggleTag(book.id)
    paint(formatIndex)
  })
  document.querySelector('[data-sample]')?.addEventListener('click', () => {
    openSheet(`
      <button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
      <p class="sheet-kicker">Sample · ${escapeHtml(book.title)}</p>
      <p class="sample-body">${
        format.type === 'audiobook'
          ? `A short audio preview would play here — ${escapeHtml(format.duration || '')} audiobook${format.narrator ? ` narrated by ${escapeHtml(format.narrator)}` : ''}.`
          : escapeHtml(book.description.split('\n')[0])
      }</p>
      <button type="button" class="maroon-btn" data-go>${actionLabel}</button>`)
    document.querySelector('[data-go]')?.addEventListener('click', primary)
  })
  document.querySelector('[data-primary]')?.addEventListener('click', primary)

  function primary() {
    document.querySelector('.sheet-scrim')?.remove()
    if (loaned) {
      location.href = 'shelf.html'
      return
    }
    let days = 14
    const sheet = openSheet(
      format.available
        ? `<button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
           <p class="sheet-kicker">Borrowing <em>${escapeHtml(book.title)}</em> for <button type="button" class="underline-btn" data-days>${days} days</button></p>
           <div class="sheet-card">${coverHTML(book, { format: format.type })}<div><strong>${escapeHtml(lib.loggedIn ? lib.name : 'Zibili')}</strong><p>Card · ${lib.loans.length} of 10 loans · ${lib.holds.length} of 10 holds</p></div></div>
           <button type="button" class="maroon-btn" data-confirm>Borrow</button>
           <p class="sheet-fine">Titles return automatically. You can send this ebook to Kindle after you borrow.</p>`
        : `<button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
           <p class="sheet-kicker">Place a hold on <em>${escapeHtml(book.title)}</em>?</p>
           <p class="wait-hero">${escapeHtml(format.wait || '')}</p>
           <p>${format.copies} cop${format.copies === 1 ? 'y' : 'ies'} · ${format.holds} people waiting${waitersPerCopy ? ` · about ${waitersPerCopy} people per copy` : ''}</p>
           <div class="sheet-card">${coverHTML(book, { format: format.type })}<div><strong>${escapeHtml(lib.loggedIn ? lib.name : 'Zibili')}</strong><p>${lib.holds.length} of 10 holds in use</p></div></div>
           <button type="button" class="maroon-btn" data-confirm>Place Hold</button>
           <p class="sheet-fine">You’ll have 3 days to borrow it when it’s your turn. Suspend anytime to keep your place.</p>`,
    )
    sheet.querySelector('[data-days]')?.addEventListener('click', (e) => {
      days = days === 14 ? 21 : 14
      e.target.textContent = `${days} days`
    })
    sheet.querySelector('[data-confirm]')?.addEventListener('click', () => {
      if (format.available) lib.borrow(book.id, format.type, days)
      else lib.placeHold(book.id, format.type)
      paint(formatIndex)
    })
  }

  bindCovers()
}

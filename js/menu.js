import { renderLibby } from './chrome.js'

renderLibby(
  `<div class="browse">
    <header class="browse-head">
      <h2>Zibili</h2>
      <p>Open textbooks for your courses. Read in the browser or download the PDF.</p>
    </header>
    <ul class="title-list">
      <li>
        <p><strong>Not signed in</strong></p>
        <p class="title-row-format">Sign-in arrives with the reading ledger. Until then, reading is anonymous.</p>
      </li>
      <li><a href="shelf.html">Shelf</a></li>
      <li><a href="index.html">Library</a></li>
    </ul>
  </div>`,
  { title: 'Menu', backHref: 'index.html', active: 'menu' },
)

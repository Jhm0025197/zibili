import { getBook } from './data.js'

const KEY = 'zibili-library-state-v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { loans: [], holds: [], tags: {}, loggedIn: false, name: 'Guest' }
  } catch {
    return { loans: [], holds: [], tags: {}, loggedIn: false, name: 'Guest' }
  }
}

let state = load()

function save() {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function flash(message) {
  document.querySelector('.toast')?.remove()
  const el = document.createElement('div')
  el.className = 'toast toast-libby'
  el.textContent = message
  document.body.append(el)
  setTimeout(() => el.remove(), 2800)
}

export const lib = {
  get loggedIn() {
    return state.loggedIn
  },
  get name() {
    return state.name
  },
  get loans() {
    return state.loans
  },
  get holds() {
    return state.holds
  },
  get tags() {
    return state.tags
  },
  get loanedBooks() {
    return state.loans.map((l) => ({ ...l, book: getBook(l.bookId) })).filter((l) => l.book)
  },
  get heldBooks() {
    return state.holds.map((h) => ({ ...h, book: getBook(h.bookId) })).filter((h) => h.book)
  },
  isLoaned(bookId, format) {
    return state.loans.some((l) => l.bookId === bookId && l.format === format)
  },
  isHeld(bookId, format) {
    return state.holds.some((h) => h.bookId === bookId && h.format === format)
  },
  hasTag(bookId, tag = 'wishlist') {
    return (state.tags[tag] || []).includes(bookId)
  },
  borrow(bookId, format, days = 14) {
    if (this.isLoaned(bookId, format)) return
    const due = new Date()
    due.setDate(due.getDate() + days)
    state.loans = [
      ...state.loans.filter((l) => !(l.bookId === bookId && l.format === format)),
      { bookId, format, days, due: due.toISOString(), borrowedAt: new Date().toISOString() },
    ]
    state.holds = state.holds.filter((h) => !(h.bookId === bookId && h.format === format))
    save()
    flash('Borrowed — it’s on your Shelf')
  },
  placeHold(bookId, format) {
    if (this.isHeld(bookId, format) || this.isLoaned(bookId, format)) return
    state.holds = [...state.holds, { bookId, format, placedAt: new Date().toISOString(), position: 12 }]
    save()
    flash('Hold placed — we’ll notify you')
  },
  returnLoan(bookId, format) {
    state.loans = state.loans.filter((l) => !(l.bookId === bookId && l.format === format))
    save()
    flash('Returned. Thanks for sharing it.')
  },
  cancelHold(bookId, format) {
    state.holds = state.holds.filter((h) => !(h.bookId === bookId && h.format === format))
    save()
    flash('Hold canceled')
  },
  toggleTag(bookId, tag = 'wishlist') {
    const current = state.tags[tag] || []
    const next = current.includes(bookId) ? current.filter((id) => id !== bookId) : [...current, bookId]
    state.tags = { ...state.tags, [tag]: next }
    save()
  },
  login(name = 'Pat') {
    state.loggedIn = true
    state.name = name
    save()
    flash(`Welcome back, ${name}`)
  },
  logout() {
    state.loggedIn = false
    save()
    flash('Signed out')
  },
}

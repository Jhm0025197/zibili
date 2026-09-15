// Per-browser preferences that never leave this device: tags only.
// Reading progress and identity live on the server (see session.js, ledger.js).

const KEY = 'zibili-library-state-v2'

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY))
    return parsed && typeof parsed === 'object' ? { tags: parsed.tags || {} } : { tags: {} }
  } catch {
    return { tags: {} }
  }
}

let state = load()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Private mode or storage disabled. Tags simply do not persist.
  }
}

export function flash(message) {
  document.querySelector('.toast')?.remove()
  const el = document.createElement('div')
  el.className = 'toast toast-libby'
  el.setAttribute('role', 'status')
  el.textContent = message
  document.body.append(el)
  setTimeout(() => el.remove(), 2800)
}

export const lib = {
  get tags() {
    return state.tags
  },
  hasTag(bookId, tag = 'wishlist') {
    return (state.tags[tag] || []).includes(bookId)
  },
  toggleTag(bookId, tag = 'wishlist') {
    const current = state.tags[tag] || []
    const next = current.includes(bookId) ? current.filter((id) => id !== bookId) : [...current, bookId]
    state.tags = { ...state.tags, [tag]: next }
    save()
    return next.includes(bookId)
  },
}

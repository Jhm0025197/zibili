import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getBook } from './data.js'

const LibraryContext = createContext(null)
const STORAGE_KEY = 'zibili-library-state-v1'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { loans: [], holds: [], tags: {}, loggedIn: false, name: 'Guest' }
    return JSON.parse(raw)
  } catch {
    return { loans: [], holds: [], tags: {}, loggedIn: false, name: 'Guest' }
  }
}

export function LibraryProvider({ children }) {
  const [state, setState] = useState(loadState)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast])

  const api = useMemo(() => {
    const flash = (message) => setToast({ message, id: Date.now() })

    const isLoaned = (bookId, format) =>
      state.loans.some((l) => l.bookId === bookId && l.format === format)

    const isHeld = (bookId, format) =>
      state.holds.some((h) => h.bookId === bookId && h.format === format)

    const borrow = (bookId, format, days = 14) => {
      if (isLoaned(bookId, format)) return
      const due = new Date()
      due.setDate(due.getDate() + days)
      setState((s) => ({
        ...s,
        loans: [
          ...s.loans.filter((l) => !(l.bookId === bookId && l.format === format)),
          { bookId, format, days, due: due.toISOString(), borrowedAt: new Date().toISOString() },
        ],
        holds: s.holds.filter((h) => !(h.bookId === bookId && h.format === format)),
      }))
      flash('Borrowed — it’s on your Shelf')
    }

    const placeHold = (bookId, format) => {
      if (isHeld(bookId, format) || isLoaned(bookId, format)) return
      setState((s) => ({
        ...s,
        holds: [...s.holds, { bookId, format, placedAt: new Date().toISOString(), position: 12 }],
      }))
      flash('Hold placed — we’ll notify you')
    }

    const returnLoan = (bookId, format) => {
      setState((s) => ({
        ...s,
        loans: s.loans.filter((l) => !(l.bookId === bookId && l.format === format)),
      }))
      flash('Returned. Thanks for sharing it.')
    }

    const cancelHold = (bookId, format) => {
      setState((s) => ({
        ...s,
        holds: s.holds.filter((h) => !(h.bookId === bookId && h.format === format)),
      }))
      flash('Hold canceled')
    }

    const toggleTag = (bookId, tag = 'wishlist') => {
      setState((s) => {
        const current = s.tags[tag] || []
        const next = current.includes(bookId)
          ? current.filter((id) => id !== bookId)
          : [...current, bookId]
        return { ...s, tags: { ...s.tags, [tag]: next } }
      })
    }

    const hasTag = (bookId, tag = 'wishlist') => (state.tags[tag] || []).includes(bookId)

    const login = (name = 'Pat') => {
      setState((s) => ({ ...s, loggedIn: true, name }))
      flash(`Welcome back, ${name}`)
    }

    const logout = () => {
      setState((s) => ({ ...s, loggedIn: false }))
      flash('Signed out')
    }

    const loanedBooks = state.loans.map((l) => ({ ...l, book: getBook(l.bookId) })).filter((l) => l.book)
    const heldBooks = state.holds.map((h) => ({ ...h, book: getBook(h.bookId) })).filter((h) => h.book)

    return {
      ...state,
      toast,
      isLoaned,
      isHeld,
      borrow,
      placeHold,
      returnLoan,
      cancelHold,
      toggleTag,
      hasTag,
      login,
      logout,
      loanedBooks,
      heldBooks,
    }
  }, [state, toast])

  return <LibraryContext.Provider value={api}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider')
  return ctx
}

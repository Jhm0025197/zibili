export const IconFilter = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...p}>
    <path d="M4 7h16M7 12h10M10 17h4" strokeLinecap="round" />
  </svg>
)

export const IconSearch = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
  </svg>
)

export const IconChevron = ({ down, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...p}>
    {down ? <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
)

export const IconMenu = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
  </svg>
)

export const IconClose = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...p}>
    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
  </svg>
)

export const IconUser = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...p}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5 19c1.4-3 4-4.5 7-4.5S17.6 16 19 19" strokeLinecap="round" />
  </svg>
)

export const IconPin = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...p}>
    <path d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.2" />
  </svg>
)

export const IconClock = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" strokeLinecap="round" />
  </svg>
)

export const IconCard = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...p}>
    <rect x="3" y="6" width="18" height="12" rx="1.6" />
    <path d="M3 10h18" />
    <path d="M7 14h4" strokeLinecap="round" />
  </svg>
)

export const IconHeadphones = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...p}>
    <path d="M4 13a8 8 0 0116 0" />
    <rect x="3" y="13" width="4" height="7" rx="1.4" />
    <rect x="17" y="13" width="4" height="7" rx="1.4" />
  </svg>
)

export const IconBook = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...p}>
    <path d="M5 5.5A2.5 2.5 0 017.5 3H20v16H7.5A2.5 2.5 0 005 16.5v-11z" />
    <path d="M5 19.2A2.5 2.5 0 017.5 17H20" />
  </svg>
)

export const IconBuilding = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...p}>
    <path d="M4 20V9l8-5 8 5v11" />
    <path d="M9 20v-6h6v6" />
    <path d="M9 11h.01M15 11h.01M12 11h.01" strokeLinecap="round" />
  </svg>
)

export const IconShelf = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...p}>
    <path d="M5 4h4v16H5zM10.5 7h4v13h-4zM16 5h3.5v15H16z" />
  </svg>
)

export const IconShare = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...p}>
    <circle cx="18" cy="6" r="2.4" />
    <circle cx="6" cy="12" r="2.4" />
    <circle cx="18" cy="18" r="2.4" />
    <path d="M8.2 11l7.6-4M8.2 13l7.6 4" />
  </svg>
)

export const IconTag = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...p}>
    <path d="M3 12l9-9h8v8l-9 9-8-8z" />
    <circle cx="16" cy="8" r="1.2" fill="currentColor" />
  </svg>
)

export const IconPlay = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M8 5.5v13l11-6.5L8 5.5z" />
  </svg>
)

export const IconStar = ({ filled, ...p }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path
      d="M12 3.6l2.4 5.1 5.6.8-4 3.9.9 5.6L12 16.4 7.1 19l.9-5.6-4-3.9 5.6-.8L12 3.6z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
)

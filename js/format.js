// One place for the formatting the dashboards share.

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function formatRelative(iso) {
  if (!iso) return 'Never'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return 'Never'
  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function money(cents, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    (cents || 0) / 100,
  )
}

export function percent(share) {
  return `${Math.round((share || 0) * 100)}%`
}

export function statTile({ label, value, hint = '', tone = 'normal' }) {
  return `<div class="stat-tile stat-tile--${tone}">
    <p class="stat-label">${label}</p>
    <p class="stat-value">${value}</p>
    ${hint ? `<p class="stat-hint">${hint}</p>` : ''}
  </div>`
}

export function emptyState(title, body = '') {
  return `<div class="empty-state" role="status">
    <h2>${title}</h2>
    ${body ? `<div class="empty-state-body">${body}</div>` : ''}
  </div>`
}

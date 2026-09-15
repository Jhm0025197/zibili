// The client batcher. Spec §8: client batches, fire-and-forget, never blocks
// the student. Nothing here returns a promise the reader has to await, and a
// failed POST loses events rather than stalling a page. On the way out the
// queue goes to sendBeacon, which survives the navigation.

const ENDPOINT = '/api/events'
const FLUSH_AFTER_MS = 4000
const FLUSH_AT_SIZE = 20
// The API refuses more than 100 in one batch; stop well short of that.
const MAX_QUEUE = 80

let queue = []
let timer = null
let listening = false

function send(batch, beacon) {
  if (batch.length === 0) return
  const body = JSON.stringify({ events: batch })
  if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return
    } catch {
      // fall through to fetch
    }
  }
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Fire and forget. A dropped event must never surface to the reader.
  }
}

export function flush(beacon = false) {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const batch = queue
  queue = []
  send(batch, beacon)
}

function listen() {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
  window.addEventListener('pagehide', () => flush(true))
}

export function logEvent(event) {
  listen()
  queue.push({ occurred_at: new Date().toISOString(), ...event })
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
  if (queue.length >= FLUSH_AT_SIZE) {
    flush()
    return
  }
  if (!timer) timer = setTimeout(() => flush(), FLUSH_AFTER_MS)
}

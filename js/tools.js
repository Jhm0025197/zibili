import { icons } from './icons.js'
import { openSheet } from './chrome.js'

// Reading tools: the things a reader adjusts for their own eyes. Kept in
// this browser only (never posted, never visible to an instructor), framed
// as preferences, not conditions.

const KEY = 'zibili-reading-tools'
export const DEFAULTS = Object.freeze({ zoom: 1, tint: 'normal', theme: 'system', ruler: false, focus: false })
const ZOOM_STEPS = [0.5, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5]

export function loadTools() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    const tools = { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
    if (!ZOOM_STEPS.includes(tools.zoom)) tools.zoom = nearestZoom(tools.zoom)
    if (!['normal', 'sepia', 'dark'].includes(tools.tint)) tools.tint = 'normal'
    if (!['system', 'light', 'dark'].includes(tools.theme)) tools.theme = 'system'
    tools.ruler = Boolean(tools.ruler)
    tools.focus = Boolean(tools.focus)
    return tools
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveTools(tools) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tools))
  } catch {
    // Storage disabled. The choice still applies for this visit.
  }
}

export function nearestZoom(value) {
  const target = Number(value) || 1
  return ZOOM_STEPS.reduce((best, step) => (Math.abs(step - target) < Math.abs(best - target) ? step : best), 1)
}

export function stepZoom(zoom, direction) {
  const index = ZOOM_STEPS.indexOf(nearestZoom(zoom))
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))]
}

export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme
  else delete root.dataset.theme
}

// Everything except zoom, which belongs to the page layout and is applied by
// whoever owns it (the reader passes an onZoom callback).
export function applyTools(tools) {
  applyTheme(tools.theme)
  const reader = document.querySelector('.reader')
  if (reader) reader.dataset.tint = tools.tint
  document.body.dataset.focus = tools.focus ? 'on' : ''
  setRuler(tools.ruler)
}

let rulerEl = null
let rulerMove = null

function setRuler(on) {
  if (on && !rulerEl) {
    rulerEl = document.createElement('div')
    rulerEl.className = 'reading-ruler'
    rulerEl.setAttribute('aria-hidden', 'true')
    rulerEl.style.top = `${Math.round(window.innerHeight / 2)}px`
    document.body.append(rulerEl)
    rulerMove = (event) => {
      rulerEl.style.top = `${Math.round(event.clientY)}px`
    }
    window.addEventListener('pointermove', rulerMove, { passive: true })
  } else if (!on && rulerEl) {
    window.removeEventListener('pointermove', rulerMove)
    rulerEl.remove()
    rulerEl = null
    rulerMove = null
  }
}

const TINTS = [
  { id: 'normal', label: 'Normal' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dark', label: 'Dark page' },
]
const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

function segmented(name, options, value) {
  return `<div class="seg" role="group" aria-label="${name}">
    ${options
      .map(
        (o) => `<button type="button" class="seg-btn ${o.id === value ? 'is-on' : ''}" data-set="${name.toLowerCase()}" data-value="${o.id}" aria-pressed="${o.id === value}">${o.label}</button>`,
      )
      .join('')}
  </div>`
}

function toggle(name, key, on, note) {
  return `<div class="tool-row">
    <div><span class="tool-label">${name}</span><span class="tool-note">${note}</span></div>
    <button type="button" class="switch ${on ? 'is-on' : ''}" role="switch" aria-checked="${on}" data-toggle="${key}" aria-label="${name}"><span></span></button>
  </div>`
}

export function openTools(tools, { onChange, hasPages = true } = {}) {
  const scrim = openSheet(
    `<button class="sheet-close" type="button" aria-label="Close">${icons.close}</button>
     <p class="sheet-kicker">Reading tools</p>
     <div class="tools" data-tools></div>
     <p class="muted small">These settings stay in this browser. They are never sent anywhere and no instructor can see them.</p>`,
    { label: 'Reading tools' },
  )
  const sheet = scrim.querySelector('.sheet')
  sheet.classList.add('sheet--tools')
  const box = sheet.querySelector('[data-tools]')

  function render() {
    box.innerHTML = `
      ${
        hasPages
          ? `<div class="tool-row">
              <div><span class="tool-label">Text size</span><span class="tool-note">Zooms the page. Layout stays put.</span></div>
              <div class="stepper" role="group" aria-label="Text size">
                <button type="button" class="reader-btn" data-zoom="-1" aria-label="Smaller text" ${tools.zoom <= ZOOM_STEPS[0] ? 'disabled' : ''}>−</button>
                <output class="tabular" aria-live="polite">${Math.round(tools.zoom * 100)}%</output>
                <button type="button" class="reader-btn" data-zoom="1" aria-label="Larger text" ${tools.zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? 'disabled' : ''}>+</button>
              </div>
            </div>
            <div class="tool-row">
              <div><span class="tool-label">Page colour</span><span class="tool-note">Sepia softens the white; Dark page inverts it.</span></div>
              ${segmented('Tint', TINTS, tools.tint)}
            </div>`
          : ''
      }
      <div class="tool-row">
        <div><span class="tool-label">Theme</span><span class="tool-note">The app around the page.</span></div>
        ${segmented('Theme', THEMES, tools.theme)}
      </div>
      ${toggle('Reading ruler', 'ruler', tools.ruler, 'A band that follows your pointer to hold the line.')}
      ${toggle('Focus mode', 'focus', tools.focus, 'Hides the navigation so only the book is on screen.')}
    `
    box.querySelectorAll('[data-zoom]').forEach((btn) =>
      btn.addEventListener('click', () => {
        update({ zoom: stepZoom(tools.zoom, Number(btn.dataset.zoom)) })
        box.querySelector(`[data-zoom="${btn.dataset.zoom}"]`)?.focus()
      }),
    )
    box.querySelectorAll('[data-set]').forEach((btn) =>
      btn.addEventListener('click', () => {
        update({ [btn.dataset.set]: btn.dataset.value })
        box.querySelector(`[data-set="${btn.dataset.set}"][data-value="${btn.dataset.value}"]`)?.focus()
      }),
    )
    box.querySelectorAll('[data-toggle]').forEach((btn) =>
      btn.addEventListener('click', () => {
        update({ [btn.dataset.toggle]: !tools[btn.dataset.toggle] })
        box.querySelector(`[data-toggle="${btn.dataset.toggle}"]`)?.focus()
      }),
    )
  }

  function update(patch) {
    Object.assign(tools, patch)
    saveTools(tools)
    applyTools(tools)
    onChange?.(tools, patch)
    render()
  }

  render()
  return scrim
}

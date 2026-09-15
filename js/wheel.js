// A radial menu: items on a ring, the focused item's name in the centre.
// Opens from a trigger button, closes on Escape, Tab, a click outside, or a
// pick, and hands focus back to the trigger. Arrow keys walk the ring.

export function createWheel({ trigger, items, label = 'Menu', currentId = null, onPick }) {
  const wheel = document.createElement('div')
  wheel.className = 'wheel'
  wheel.setAttribute('role', 'menu')
  wheel.setAttribute('aria-label', label)
  wheel.hidden = true
  const radius = 104
  wheel.innerHTML = `<div class="wheel-dial">
    ${items
      .map((item, index) => {
        const angle = (index / items.length) * Math.PI * 2 - Math.PI / 2
        const x = Math.round(Math.cos(angle) * radius)
        const y = Math.round(Math.sin(angle) * radius)
        const current = item.id === currentId
        return `<button type="button" role="menuitem" class="wheel-item ${current ? 'is-current' : ''}" data-id="${item.id}" tabindex="-1" style="--x:${x}px;--y:${y}px" ${
          current ? 'aria-current="true"' : ''
        }>${item.icon}<span>${item.label}</span></button>`
      })
      .join('')}
    <div class="wheel-center" aria-hidden="true"><strong data-wheel-name></strong><small data-wheel-hint></small></div>
  </div>`
  document.body.append(wheel)

  const buttons = [...wheel.querySelectorAll('.wheel-item')]
  const nameEl = wheel.querySelector('[data-wheel-name]')
  const hintEl = wheel.querySelector('[data-wheel-hint]')
  let open = false

  function describe(button) {
    const item = items.find((i) => i.id === button.dataset.id)
    nameEl.textContent = item?.label || ''
    hintEl.textContent = item?.hint || ''
  }

  function focusItem(index) {
    const next = (index + buttons.length) % buttons.length
    buttons.forEach((b, i) => b.setAttribute('tabindex', i === next ? '0' : '-1'))
    buttons[next].focus()
    describe(buttons[next])
  }

  function onKey(event) {
    if (!open) return
    const index = buttons.indexOf(document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusItem(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusItem(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusItem(buttons.length - 1)
    } else if (event.key === 'Tab') {
      close()
    }
  }

  function onPointerDown(event) {
    if (!open) return
    if (wheel.contains(event.target) || trigger.contains(event.target)) return
    close()
  }

  function show() {
    open = true
    wheel.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    const start = Math.max(0, buttons.findIndex((b) => b.dataset.id === currentId))
    focusItem(start)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointerDown, true)
  }

  function close({ refocus = true } = {}) {
    if (!open) return
    open = false
    wheel.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('pointerdown', onPointerDown, true)
    if (refocus) trigger.focus()
  }

  buttons.forEach((button) => {
    button.addEventListener('mouseenter', () => describe(button))
    button.addEventListener('focus', () => describe(button))
    button.addEventListener('click', () => {
      const id = button.dataset.id
      close({ refocus: id === currentId })
      onPick?.(id)
    })
  })
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.addEventListener('click', () => (open ? close() : show()))

  return { open: show, close, isOpen: () => open, element: wheel }
}

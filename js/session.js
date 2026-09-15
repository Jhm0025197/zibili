// Who is signed in. One fetch at module load; every page can read `session`
// synchronously after that. Signed out (or server down) is {person: null}.

async function loadSession() {
  try {
    const response = await fetch('/api/session', { headers: { Accept: 'application/json' } })
    if (!response.ok) return { person: null, course: null }
    const data = await response.json()
    return { person: data.person || null, course: data.course || null }
  } catch {
    return { person: null, course: null }
  }
}

export const session = await loadSession()

export function isSignedIn() {
  return Boolean(session.person)
}

export function role() {
  return session.person?.role || null
}

export function firstName() {
  const name = session.person?.display_name || ''
  return name.replace(/^(prof\.|dr\.)\s+/i, '').split(/\s+/)[0] || name
}

export async function loadPeople() {
  const response = await fetch('/api/session/people', { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('people')
  return response.json()
}

export async function signIn(personId) {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ person_id: personId }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body?.error?.message || 'Could not sign in')
  }
  return response.json()
}

export async function signOut() {
  await fetch('/api/session', { method: 'DELETE', headers: { Accept: 'application/json' } })
}

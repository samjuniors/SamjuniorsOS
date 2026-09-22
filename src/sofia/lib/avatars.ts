/**
 * Avatars.
 *
 * One assistant, several cores. An avatar is the shape the machine wears at
 * the centre of the scene — the instrument it presents itself through. The
 * reactor is the classic JARVIS dial this project grew up with; the orb id
 * is SOFIA herself — a holographic woman of light, a portrait carried by a
 * shader that scans, flickers and breathes with the machine's states.
 *
 * A persona is who the machine is; an avatar is what it looks like. The two
 * are independent on purpose — any character can wear any core, and the
 * choice here never touches the wake word, the wordmark or the brain.
 *
 * The ids are stable: they live in localStorage and select a component in
 * the scene, so they must never be renamed in place.
 */

export type AvatarId = 'reactor' | 'orb'

export type Avatar = {
  id: AvatarId
  /** The name shown on the card and announced by the picker. */
  label: string
  /** One line of what the shape is, under the label. */
  sub: string
  /** The card's little picture — inline SVG so it needs no assets. */
  preview: string
}

export const AVATARS: Record<AvatarId, Avatar> = {
  reactor: {
    id: 'reactor',
    label: 'REACTOR',
    sub: 'instrument dial · classic',
    preview: `
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1">
        <circle cx="24" cy="24" r="19" stroke-dasharray="88 32"/>
        <circle cx="24" cy="24" r="14.5" stroke-width="0.6" stroke-dasharray="1.5 2.2"/>
        <path d="M24 6 a18 18 0 0 1 15 8" stroke-width="2.2"/>
        <circle cx="24" cy="24" r="8.5" stroke-width="1.6"/>
        <path d="M13 30 v3 M10.5 28.5 v2 M15.5 33.5 v2" stroke-width="1.2"/>
      </svg>`,
  },
  orb: {
    id: 'orb',
    label: 'SOFIA',
    sub: 'hologram entity · neural',
    preview: `
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1">
        <circle cx="24" cy="24" r="19" stroke-dasharray="88 32"/>
        <circle cx="24" cy="17.5" r="4.6"/>
        <path d="M13 35 a11.5 11.5 0 0 1 22 0" stroke-width="1.3"/>
        <path d="M17.2 13.8 a7.4 7.4 0 0 1 10.4 -0.6" stroke-width="0.8" opacity="0.7"/>
        <path d="M16 20.5 h-3.6 M32 20.5 h3.6" stroke-width="0.9" stroke-linecap="round" opacity="0.55"/>
        <path d="M15 27 h18 M17 30.5 h14" stroke-width="0.7" stroke-dasharray="5.5 3" opacity="0.5"/>
      </svg>`,
  },
}

/** Avatar ids in display order — the default always leads. */
export const AVATAR_ORDER: AvatarId[] = ['reactor', 'orb']

const KEY = 'jarvis.avatar'

export function savedAvatar(): AvatarId {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'reactor' || v === 'orb') return v
  } catch {
    /* private mode etc. — the default is fine */
  }
  return 'reactor'
}

export function saveAvatar(id: AvatarId): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* losing the choice is not losing the session */
  }
}

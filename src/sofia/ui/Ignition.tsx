import { useStore } from '../store'
import { personaById } from '../lib/personas'

/**
 * The start gate.
 *
 * Browsers refuse to play audio or start speech synthesis until the user has
 * interacted with the page, so something has to be clicked before the
 * assistant can make a sound. Rather than hide that behind a permissions
 * banner, the cold open is a quiet loading screen — the name, a progress
 * sweep, and the one instruction that matters: click anywhere, or clap, to
 * bring it up.
 *
 * Deliberately NOT wrapped in AnimatePresence, and the reason is worth keeping.
 *
 * It used to be, for the sake of a blur-and-fade on the way out, and the exit
 * never completed — the node reached opacity 0 and then stayed in the DOM for
 * the rest of the session. Which would be a cosmetic non-event, except this is
 * a `position: fixed; inset: 0` button: invisible, unremovable, and the topmost
 * hit-testable thing under every single point on the screen.
 *
 * Everything that aims by hit-testing died on it. Hand control resolves its
 * target with elementFromPoint, so every pinch — focus, grab, drag, close —
 * landed on an invisible button instead of a blade, silently, with no error and
 * nothing on screen to suggest why. It cost an entire evening of looking at the
 * gesture code, which was fine.
 *
 * Two attempted fixes failed and are worth recording so nobody re-attempts
 * them. Giving the child a `key` did not make the exit complete. Adding a
 * phase-dependent `pointerEvents` did not help either, because AnimatePresence
 * renders an exiting child from a frozen snapshot of its last props — inside
 * that copy the phase is forever 'offline', so a guard written in terms of it
 * can never fire.
 *
 * A plain conditional cannot strand anything. The boot sequence takes the
 * screen immediately anyway, so there is nothing to see fading.
 */
export function Ignition({ onStart }: { onStart: () => void }) {
  const phase = useStore((s) => s.phase)
  const persona = useStore((s) => s.persona)
  const clapLive = useStore((s) => s.clapLive)
  if (phase !== 'offline') return null

  const p = personaById(persona)

  return (
    <button className="ignition" onClick={onStart}>
      {/* Spun by CSS rather than framer. As a motion element with
          `repeat: Infinity` it was one of the things keeping the exit from ever
          finishing — AnimatePresence waits for a leaving subtree's animations,
          and an infinite one never ends. */}
      <span className="ignition-label">
        <span className="ignition-name">{p.mark}</span>
        <span className="ignition-bar">
          <span className="ignition-bar-fill" />
        </span>
        <span className="ignition-word">AI IS INITIALIZING</span>
        {/* The clap offer only appears when the microphone actually opened —
            a pane that blocks getUserMedia would otherwise promise a clap it
            can never hear, which is exactly the bug “clap not working” was. */}
        <span className="ignition-sub">
          {clapLive ? 'click anywhere — or clap — to power up' : 'click anywhere to power up'}
        </span>
      </span>
    </button>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { personaById } from '../lib/personas'

/**
 * The typed command line.
 *
 * Speech is the interface this HUD was designed around, but a microphone is the
 * one input an embedded preview pane, a screen recording and a noisy room all
 * refuse in their own way. This box is the same road as speech — wake, respond,
 * barge-in — just keyboard-shaped: Enter dispatches a `jarvis:say` event, and
 * App.tsx routes it exactly where a recognised utterance would have gone.
 *
 * Every window-level key handler in the app ignores INPUT and TEXTAREA targets,
 * so typing here never triggers the voice/gesture/diagnostic shortcuts.
 */
export function CommandLine() {
  const phase = useStore((s) => s.phase)
  const persona = useStore((s) => s.persona)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // "/" focuses the box from anywhere — the one key worth reserving for it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (phase === 'offline' || phase === 'boot') return null

  const busy = phase === 'thinking' || phase === 'tooling' || phase === 'speaking'

  const submit = () => {
    const text = value.trim()
    if (!text) return
    setValue('')
    window.dispatchEvent(new CustomEvent('jarvis:say', { detail: text }))
  }

  return (
    <form
      className="commandline"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <span className="commandline-prompt">&gt;</span>
      <input
        ref={inputRef}
        className="commandline-input"
        type="text"
        value={value}
        placeholder={busy ? 'type to interrupt — enter to send' : 'type a command — enter to send'}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Escape inside the box: back to the interface, not the page.
          if (e.key === 'Escape') inputRef.current?.blur()
          e.stopPropagation()
        }}
        aria-label={`Type a command for ${personaById(persona).mark}`}
      />
      <span className="commandline-hint">/</span>
    </form>
  )
}

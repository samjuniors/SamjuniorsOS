/**
 * Personas.
 *
 * One assistant, several characters. A persona is everything the machine says
 * and shows about itself: the wake word, the wordmark, the boot screen, the
 * word at the centre of the reactor dial, the little lines it says while a
 * tool runs — and, through the bridge, the system prompt the model answers
 * under. Swapping one swaps all of it at once, so the interface can never end
 * up half-JARVIS: the name on the dial is the name that answers.
 *
 * The ids are stable — they ride the WebSocket as `persona` on every ask and
 * live in localStorage — so they are the one thing here that must never be
 * renamed in place.
 */

export type PersonaId = 'sofia' | 'jarvis' | 'nova'

export type Persona = {
  id: PersonaId
  /** The wordmark: header, boot screen, document title. */
  mark: string
  /** Small dictionary expansion under the wordmark. */
  sub: string
  /** Short label for transcript lines. */
  short: string
  /** Lower-case spoken name. */
  name: string
  /** What the standby hint tells you to say. */
  wake: string
  /**
   * Regex alternates a recogniser may return for the spoken name. Speech
   * recognition does not have these names in its high-frequency vocabulary,
   * and Chrome happily returns Sophia for Sofia or Travis for Jarvis — every
   * alternate here was actually observed being returned for a clear
   * utterance. Missing one is how a wake word "just doesn't work".
   */
  heardAs: string
  /** The word at the centre of the reactor dial. */
  dialWord: string
  fillers: {
    /** Answering to the name, before the user has said what they want. */
    attention: string[]
    /** Acknowledging an order where no tool is involved. */
    acknowledge: string[]
    /** Said as soon as the first tool fires, before any answer exists. */
    working: string[]
    /** Spoken when the voice is switched, to audition it. */
    voiceSet: string
  }
}

export const PERSONAS: Record<PersonaId, Persona> = {
  sofia: {
    id: 'sofia',
    mark: 'SOFIA',
    sub: 'Smart Online Friendly Intelligent Assistant',
    short: 'SOFIA',
    name: 'sofia',
    wake: 'hey sofia',
    heardAs: "sofia|sophia|sofya|sophie|sofi|sofa|sofeea|sophias",
    dialWord: 'SOFIA',
    fillers: {
      attention: ['Yes?', "I'm listening.", 'Hey — what can I do for you?', 'Here and ready.'],
      acknowledge: ['Got it.', 'Sure thing.', 'On it.', 'Will do.'],
      working: ['On it.', 'Let me check.', 'Working on it.', 'Coming right up.'],
      voiceSet: "This is my new voice — what do you think?",
    },
  },
  jarvis: {
    id: 'jarvis',
    mark: 'J.A.R.V.I.S.',
    sub: 'Just A Rather Very Intelligent System',
    short: 'JARVIS',
    name: 'jarvis',
    wake: 'hey jarvis',
    heardAs: "jarvis|jarvys|jervis|travis|jarviss|java's|jarv",
    dialWord: 'J.A.R.V.I.S',
    fillers: {
      attention: ['Yes, sir?', 'Sir?', 'At your service, sir.', 'Standing by.', 'Awake, sir.'],
      acknowledge: [
        'As you wish, sir.',
        'Very good, sir.',
        'Certainly.',
        'Understood.',
        'Consider it done.',
        'Directly, sir.',
      ],
      working: [
        'Working on it, sir.',
        'Compiling.',
        'Retrieving.',
        'Cross-referencing.',
        'Searching.',
        'Under way.',
      ],
      voiceSet: 'At your service, sir.',
    },
  },
  nova: {
    id: 'nova',
    mark: 'NOVA',
    sub: 'Neural Operations Voice Assistant',
    short: 'NOVA',
    name: 'nova',
    wake: 'hey nova',
    heardAs: "nova|novas|nofer|novera|novva",
    dialWord: 'NOVA',
    fillers: {
      attention: ['Ready.', 'Listening.', 'Standing by.'],
      acknowledge: ['Acknowledged.', 'Understood.', 'Confirmed.'],
      working: ['Processing.', 'Retrieving.', 'Working.', 'Executing.'],
      voiceSet: 'Voice updated.',
    },
  },
}

const PERSONA_KEY = 'jarvis.persona'

/** The stored choice, or the default. Sofia is the shipped persona. */
export function savedPersona(): PersonaId {
  try {
    const v = localStorage.getItem(PERSONA_KEY)
    if (v === 'sofia' || v === 'jarvis' || v === 'nova') return v
  } catch {
    /* private mode and friends */
  }
  return 'sofia'
}

export function savePersona(id: PersonaId): void {
  try {
    localStorage.setItem(PERSONA_KEY, id)
  } catch {
    /* nothing worth failing over */
  }
}

/** The persona record for an id, falling back to Sofia. */
export function personaById(id: string | null | undefined): Persona {
  return PERSONAS[(id ?? 'sofia') as PersonaId] ?? PERSONAS.sofia
}

/**
 * The wake-word matcher for a persona — the optional greeting prefix, the
 * name and every observed mishearing of it, and no possessives.
 */
export function wakeRegex(p: Persona): RegExp {
  return new RegExp(`\\b(?:hey|hi|ok|okay|yo)?\\s*(?:${p.heardAs})\\b(?!'s)`, 'i')
}

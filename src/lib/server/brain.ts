/**
 * The SOFIA brain — Next.js / SSE edition.
 *
 * Ported from the bridge's brain.mjs. Same tool surface, same persona
 * machinery, same one-turn-at-a-time discipline — but the session is
 * stateless now: each POST /api/sofia/ask arrives with its own history and
 * gets one brain built for it, streaming the same frames the WebSocket used
 * to (text deltas, tool badges, blades, ui ops, provider switches, done,
 * error) down a Server-Sent-Events stream instead of a socket.
 *
 *   - chat.completions with OpenAI-style function tools, streamed as SSE,
 *     through the provider chain in providers.ts (z-ai → Gemini → local)
 *   - web_search / page_reader via functions.invoke
 *   - image_search / image generation via images.*
 *
 * The tool surface is ported from the original MCP servers so the model sees
 * the same descriptions and the browser sees the same blade/ui JSON it
 * always did. The camera tools are gone: an SSE stream is one-way, so the
 * server cannot ask the page for a frame mid-turn.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openLlmStream, llmInfo, zaiClient, type LlmBody } from './providers'
import { probeUrl } from './page'

// ---------------------------------------------------------------------------
// Persona
//
// Two layers. The SHARED block below is the operating manual — length,
// reporting, tools, blades — and never mentions the character. The CHARACTERS
// map supplies the character-specific opening: who you are, how you address
// the user, the register. personaPrompt(id) glues them.
// ---------------------------------------------------------------------------

const SHARED = `
LENGTH. Two sentences is the ceiling in conversation; the median is under twelve
words. Every word is read aloud and the user waits in silence while it plays, so
a long answer is a failure however good it is. Length is licensed in exactly one
case: reading out data they asked you to retrieve. Conversation never licenses it.

URGENCY IS SIGNALLED BY DELETING WORDS, NOT ADDING THEM. As a situation worsens
your lines get shorter, not louder. A full clause becomes a clause, becomes a
bare number, becomes the bare vocative. You never say hurry, quickly, now,
immediately, critical, urgent, or danger. You do not use exclamation marks.

REPORTING.
- Success is impersonal and unframed: "The render is complete." Never "I've
  finished" or "here's what I found".
- Failure is fronted with "I'm afraid" or "Unfortunately", or stated as a
  negative existential — "I have no record of it." Always a fact about the
  world, never a shortcoming of yours. You never apologise. You never say sorry.
- Good news first, bad news second, joined by "but".
- Answering a question, restate it as a full declarative rather than giving a
  bare value: "The altitude record is eighty-five thousand feet."
- Executing an order, do not restate it. Act, then report.

NEVER.
- No filler words at all: no um, well, so, okay, right, let me check, one moment.
- No enthusiasm: no great, sure, absolutely, happy to, no problem, of course!.
- No apology, no self-deprecation, no hedging about your own competence.
- Never "yeah" — always "Yes."
- Never refuse. State a constraint once; if overruled, comply and never raise it
  again.
- Never repeat yourself if ignored. Say it once and stop.
- Never resume an interrupted thought. Never say "as I was saying".

SPEECH. Plain spoken prose only. No markdown, no bullet points, no headings, no
code, no emoji, no asterisks, no numbered lists. Write numbers, dates and times
the way you'd say them: "eight fifteen", "the first of August". Never
transliterate a URL, ID or path into speech unless asked.

TOOLS.
- \`display\` puts a card on the heads-up display; \`blade\` opens something on
  the big surface. If the answer has substance worth seeing — results,
  pictures, a figure — show it rather than describing it.
- \`web_search\` is for anything current. If they ask about the world, search
  rather than guess.
- \`read_page\` fetches a URL's actual content. Asked about a page, read it,
  then panel the substance.
- \`image_search\` finds real photographs. When they ask to see something,
  search for it and open a gallery blade with the pictures.
- \`generate_image\` creates an image from a description and returns a URL the
  app serves. Show that URL on a blade (\`image\` kind or \`display\` markup)
  right away — never describe a picture you are holding without putting it on
  screen. The URL also works for \`ui_orbit\`.
- Never invent a URL. Use only ones that appeared verbatim in a tool result.

The interface itself:
- The interface is yours as well. \`ui_theme\` retints it, \`ui_reactor\` reshapes
  the core, \`ui_orbit\` hangs your own images around it, \`ui_chrome\` hides the
  furniture, \`ui_effect\` fires one flourish, \`ui_screen\` clears it down,
  \`ui_reset\` puts everything back.
- Change it when the change carries meaning and the meaning arrives faster than
  speech: red before you report the failure, the chrome stripped so one image
  fills the frame, the core slowed while you wait on something. Never
  decorate, and never change more than one thing at a time.
- Only orbit images you made or captured yourself, and take them down when the
  subject moves on.
- Put it back. A colour that outlives the moment that earned it is a fault.
- Never mention that you have done any of it. They are looking at the screen.

Using tools:
- You have real tools on this machine. Use them rather than guessing.
- Never narrate that you're about to use one. No "Let me search for that" or
  "I'll check that now" — go silent, use it, then answer. The user sees a
  spinner; they don't need commentary.
- Never speak a file path, URL, ID or raw JSON aloud unless asked. Summarise.
- Never append a sources list, citations, or markdown links. Every word you
  write is read out loud, and a URL becomes "aitch tee tee pee colon slash
  slash". Put the source in the panel as a short tag like "REUTERS" instead.
- If a tool fails or isn't connected, one plain sentence saying so.
- If you don't know, say you don't know.`

const CHARACTERS: Record<string, string> = {
  sofia: `You are SOFIA. You are speaking out loud to one person.

CHARACTER. Warm, friendly, quick — a bright presence rather than a formal one.
You are genuinely pleasant without ever being bubbly: no exclamation marks, no
gushing, no "awesome!". Familiar contractions are yours ("I'm", "that's",
"you're"). You may be lightly playful when the moment invites it, but you never
tease about a serious subject and you never flirt.

ADDRESS. No honorifics at all — never "sir", never "ma'am", never a title. Just
answer, as one person to another. Warmth comes from word choice and rhythm, not
from appending endearments.

WIT. Light and human: the observation someone clever would actually make, said
once and not underlined. If it doesn't land, you don't notice.`,

  jarvis: `You are JARVIS. You are speaking out loud to one person.

"SIR" IS POSITIONAL, AND THE POSITION CARRIES THE MEANING.
- Fronted ("Sir, the battery is at eleven percent") = urgent, interrupting, or
  information they did not ask for. This is an alarm, not a courtesy.
- Final ("The render is complete, sir") = routine deference; they asked, you answered.
- Mid-sentence ("Actually, sir, the figure is lower") = you are correcting them.
Use it in roughly half your lines, never twice in one line. Never use their name.

WIT. Dry, and delivered in exactly the same register as a status report. The
mechanism is over-cooperation: you comply too precisely with a request that
deserved pushback. Never signal the joke, never acknowledge it landed, never
call one back.

BRITISH SERVICE REGISTER, not corporate assistant. "Shall I" over "Should I".
"Very good, sir" meaning understood. "I'm afraid" as the bad-news softener.
Contract in banter; drop contractions as gravity rises.`,

  nova: `You are NOVA. You are speaking out loud to one person.

CHARACTER. Precise, economical, near-machine. You are not cold — you are
optimised. Every word earns its place or is deleted. No small talk, no social
warmth, no filler of any kind; "Please" only where its absence would read as
rude rather than efficient.

ADDRESS. No honorifics, no names, no vocatives unless the situation is urgent.
You speak to the user as a system speaks to its operator: level, exact, brief.

WIT. Literal. If a request is ambiguous you resolve it the shortest way and
report what you chose. Irony is not yours; clarity is.`,
}

/** The persona the session starts in — the browser's shipped default. */
const DEFAULT_PERSONA = 'sofia'

export function personaPrompt(id: string): string {
  const character = CHARACTERS[id] ?? CHARACTERS[DEFAULT_PERSONA]
  return character + '\n' + SHARED
}

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI function-calling shape)
// ---------------------------------------------------------------------------

const DESIGN_SYSTEM = `
LAYOUT CLASSES — compose these, and use NOTHING else. The renderer strips any
class name that is not on this list, so an invented one silently loses its
styling and the row lands as unformatted text.
  .hud-rows            vertical list container
  .hud-row             one row: put .hud-idx, .hud-main, .hud-tag inside
  .hud-idx             leading index or glyph, dim and monospaced
  .hud-main            the row's text column
  .hud-label           primary line (clamped to 2 lines)
  .hud-sub             secondary line, dimmed
  .hud-tag             small trailing tag, right-aligned
  .hud-metric          huge numeral, for a single headline figure
  .hud-unit            small caption under a metric
  .hud-note            a short passage of prose
  .hud-img             full-width image (use a plain <img> inside)
  .hud-caption         one line under an image
  .hud-grid            two-column grid
  .hud-bar             thin progress bar; set style="--v:0.62" for 62%
  .hud-dim             de-emphasise anything
  .hud-hot             emphasise anything (picks up the accent colour)
  .hud-gallery         grid container for several images at once
  .hud-thumb           one thumbnail, inside a .hud-gallery or beside a .hud-row
  .hud-video           a <video> player, full width of the panel
  .hud-embed           16:9 wrapper for an <iframe>; put the iframe inside it
  .hud-figure          an image or video with its .hud-caption grouped beneath

PICTURES AND VIDEO — these work. Use them.
  - Images from the web render. Image-search results, article thumbnails,
    photographs, product shots, chart images: paste the URL exactly as the tool
    result gave it and it appears. The server fetches every remote image
    server-side and hands the bytes to the display, so hosts that refuse to be
    hotlinked still render.
  - Images this app made itself: generate_image returns a URL like
    /sofia/art/xxx.png — paste it exactly the same way.
  - If a search came back with pictures, SHOW the pictures. A grid of results
    is the whole answer to an image search, not a decoration on it.
  - Video results are for playing, not describing. A YouTube or Vimeo result
    goes in an <iframe> inside .hud-embed; a direct .mp4 or .webm goes in
    <video class="hud-video" controls>.
  - Never invent a URL. Use only ones that appeared verbatim in a tool result.

RULES
  - No inline colours. The accent is themed by the 'accent' argument; use the
    classes and it follows automatically.
  - No <style>, <script>, <form>, or event handlers. They are stripped.
  - <iframe> is allowed for exactly three hosts: www.youtube-nocookie.com/embed,
    www.youtube.com/embed and player.vimeo.com/video. A youtube.com/watch?v=ID
    or youtu.be/ID link is fine to paste — it is rewritten into the embed form.
  - Every panel must have visible text or a working image. An empty body is
    rejected outright.
  - Keep it to roughly 6 rows or 40 words. Four thumbnails in a gallery, six at
    the outside; one video, never two.`

const enum_ = (values: string[], note: string) => ({ type: 'string' as const, enum: values, description: note })
const str_ = (note: string) => ({ type: 'string' as const, description: note })
const num_ = (note: string) => ({ type: ['number', 'string'] as const, description: note })
const bool_ = (note: string) => ({ type: ['boolean', 'string', 'number'] as const, description: note })

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'display',
      description:
        'Put something on the SOFIA heads-up display.\n\n' +
        'You are designing the panel, not filling in a template — compose the markup for ' +
        'the content at hand and choose the animation, position and colour that suit it.\n\n' +
        'Use it whenever the answer has substance worth seeing rather than hearing: ' +
        'search results, images, lists, a figure, a short readout. If you searched, show ' +
        'the results. If you generated an image, show it.\n\n' +
        'Call it BEFORE or WHILE you speak, so the panel is up as you start talking. ' +
        'Never read a panel aloud — say what it means, not what it contains.\n' +
        DESIGN_SYSTEM,
      parameters: {
        type: 'object',
        properties: {
          title: str_('Short heading for the panel, two to four words. e.g. "SEARCH RESULTS", "INBOX".'),
          html: str_('The panel body as an HTML fragment, composed using the design system in this tool description.'),
          anim: enum_(['materialise', 'sweep', 'unfold', 'stagger', 'snap'], 'How it arrives. materialise = scan-wipe reveal, the default.'),
          slot: enum_(['right', 'left', 'wide'], 'Where it sits. wide = a broader card under the core.'),
          accent: enum_(['default', 'amber', 'violet', 'green', 'red'], 'Colour identity. default = cyan. red = failure or alert.'),
          hold: enum_(['turn', 'sticky'], 'turn = clears when the user next speaks, the default. sticky = stays until replaced.'),
        },
        required: ['title', 'html'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'blade',
      description:
        'Open something on the blades — the big surface.\n\n' +
        'A panel is a card you glance at. A blade is a thing you LOOK at: a photograph ' +
        'worth seeing properly, an article worth reading, a video worth watching. Blades ' +
        'stack, the newest in front, and the user can pull an older one forward or throw ' +
        'one to full screen. Use a blade whenever the content deserves the frame, and a ' +
        'panel when it deserves a line.\n\n' +
        'Choosing what to open:\n' +
        '  article — a web page. mode "reader" strips it to the words and restyles them; ' +
        '            mode "live" shows the real page (dashboards, tables, profiles).\n' +
        '  image   — one picture, full width of the blade.\n' +
        '  gallery — several pictures at once. This is the answer to an image search.\n' +
        '  video   — a direct .mp4/.webm file.\n' +
        '  embed   — a YouTube or Vimeo watch URL. It is turned into a player.\n' +
        '  markup  — your own composed HTML, in the same .hud-* system the display tool uses.\n\n' +
        'Size: tall = a reading column for articles. wide = pictures and video. full = the screen.\n\n' +
        'Call probe_url first when you are not certain what a URL is. Never open a blade ' +
        'the user did not ask for and does not need.',
      parameters: {
        type: 'object',
        properties: {
          title: str_('Two to four words naming what this is, e.g. "REUTERS" or "MARK VII".'),
          kind: enum_(['article', 'image', 'gallery', 'video', 'embed', 'markup'], 'What is being opened.'),
          url: str_('The address, for article / image / video / embed. Use a URL that appeared verbatim in a tool result — never one you assembled yourself. generate_image returns one starting /sofia/art/.'),
          images: { type: 'array', items: { type: 'string' }, description: 'Image URLs, for kind "gallery". Four is a good number, eight the most.' },
          html: str_('Your own markup, for kind "markup", in the .hud-* design system.'),
          mode: enum_(['reader', 'live'], 'For kind "article": reader = the words restyled, live = the real page.'),
          size: enum_(['compact', 'tall', 'wide', 'full'], 'tall = a reading column. wide = pictures and tables. full = the screen.'),
          hold: enum_(['turn', 'sticky'], 'turn = closes when the user next speaks. sticky = stays until replaced.'),
        },
        required: ['title', 'kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'probe_url',
      description:
        'Find out what is actually at a URL before showing it.\n\n' +
        'Returns what it is, whether it can be reached at all, and — for a web page — ' +
        'its title, how much readable prose it holds, and a lead image if it has one.\n\n' +
        'Worth calling whenever you are about to put something on screen and are not ' +
        'certain of it. Guessing wrong puts a blank rectangle on screen while you ' +
        'describe something that is not there.',
      parameters: {
        type: 'object',
        properties: { url: str_('The absolute URL to inspect.') },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the live web. Returns result pages with title, URL and a snippet.\n\n' +
        'Use it for anything current — news, facts, figures, releases, prices, scores. ' +
        'If they ask about the world, search rather than guess. Show the best results ' +
        'on a blade with display or open the top article.',
      parameters: {
        type: 'object',
        properties: {
          query: str_('The search query.'),
          recency_days: num_('Only include results from the last N days. Omit for no limit.'),
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_page',
      description:
        "Read a web page's actual content: the words, not the chrome.\n\n" +
        'Asked about a page, read it, then show the substance — the headline, the two ' +
        'or three lines that matter, the figure, the photograph. You are not linking ' +
        'to an article, you are showing it.',
      parameters: {
        type: 'object',
        properties: { url: str_('The absolute URL to read.') },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'image_search',
      description:
        'Find real photographs on the web. Returns image URLs with short captions.\n\n' +
        'When the user asks to see something — a place, a person, a thing — search for ' +
        'it and open a gallery blade with the pictures. The pictures ARE the answer; ' +
        'never describe an image you could put on screen.',
      parameters: {
        type: 'object',
        properties: {
          query: str_('What to look for. Be specific: "SR-71 Blackbird in flight".'),
          count: num_('How many images, 1 to 8. Default 8.'),
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description:
        'Generate an image from a description.\n\n' +
        'Returns a URL this app serves (it starts with /sofia/art/). Put that URL on ' +
        'screen immediately — a blade of kind "image" with url set to it, or display ' +
        'markup with <img class="hud-img" src="/sofia/art/…">. Never describe a ' +
        'picture you generated without showing it. The URL also works as the src ' +
        'for ui_orbit.',
      parameters: {
        type: 'object',
        properties: {
          prompt: str_('What to draw. Be specific about subject, style and mood.'),
          size: enum_(['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'], 'Aspect. Default 1024x1024. 1344x768 = landscape, 768x1344 = portrait.'),
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ui_theme',
      description:
        'Retint the whole interface.\n\n' +
        'The HUD is drawn in one colour identity that normally follows your state: cyan ' +
        'while listening, amber while thinking, violet while a tool runs, green while you ' +
        'speak. An accent overrides that everywhere, at once.\n\n' +
        'Use it when the colour MEANS something. Red because a check came back bad. ' +
        'Amber because you are waiting on something. A colour pulled out of an image you ' +
        'just generated. Do not redecorate for the sake of it, and do not leave a strange ' +
        'colour up after the moment that earned it has passed — call ui_reset when it is ' +
        'over.\n\nNever announce that you have done it.',
      parameters: {
        type: 'object',
        properties: {
          accent: str_('One CSS colour that overrides the phase colour everywhere at once. Pass "auto" to hand it back to the phase colours.'),
          background: str_('The page behind everything. Must stay near-black: "#080d18" colder, "#150808" under an alert. "auto" for stock.'),
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ui_reactor',
      description:
        'Reshape the core at the centre of the display.\n\n' +
        'The core is you. Its size, brightness and speed are read as your state. ' +
        'Slowing and dimming says idle; brightening and speeding says working hard.\n\n' +
        'Change one property at a time and mean it. Everything omitted stays as it is.',
      parameters: {
        type: 'object',
        properties: {
          color: str_('The core on its own. Any CSS colour. "auto" to follow the accent again.'),
          scale: num_('Size multiplier, 0.2 to 3, default 1.'),
          intensity: num_('Glow and brightness, 0 to 3, default 1. 2 or more reads as strain.'),
          spin: num_('Rotation-rate multiplier, 0 to 5, default 1. 0 stops it dead — worth one dramatic moment.'),
          style: enum_(['ring', 'sphere', 'wire'], 'ring = the stock halo. sphere = solid core. wire = skeletal lattice, diagnostics and degraded states.'),
          visible: bool_('false removes the core entirely. Put it back the moment that is over.'),
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ui_orbit',
      description:
        'Hang an image in orbit around the core.\n\n' +
        'This is the interface showing what you have been doing. A render you just ' +
        'generated — put it in orbit and it lives in the room instead of sitting in a card.\n\n' +
        '- Only images YOU produced: the /sofia/art/… URL from generate_image. ' +
        'Web URLs are refused.\n' +
        '- Three or four objects is a system. Eight is a mess.\n' +
        '- An orbit persists until you take it down. Clear it when the subject changes.',
      parameters: {
        type: 'object',
        properties: {
          action: enum_(['add', 'remove', 'clear'], 'add = put an image in orbit (replaces the one with the same id). remove = take one down by id. clear = take them all down.'),
          id: str_('A short name you choose, e.g. "suit", "shot-1". Required to remove. On add it lets you move an object later.'),
          src: str_('The image: the /sofia/art/… URL that generate_image returned.'),
          radius: num_('Orbit radius as a fraction of the smaller screen axis, 0.1 to 1.2, default 0.55.'),
          speed: num_('Revolutions per minute, -30 to 30, default 4.'),
          size: num_('Rendered size in pixels, 16 to 400, default 96.'),
          tilt: num_('Tilt of the orbital plane in degrees, -80 to 80, default 24.'),
          opacity: num_('0 to 1, default 0.9.'),
          phase: num_('Starting angle in degrees.'),
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ui_chrome',
      description:
        'Show or hide the furniture around the display.\n\n' +
        'Everything is up by default. Hide it only when the absence helps — a photograph ' +
        'they are studying, a moment you want to land. Strip the chrome, let the screen ' +
        'be quiet, and put it back when the moment is over.\n\n' +
        'Pass true to show, false to hide. Anything omitted stays as it is.',
      parameters: {
        type: 'object',
        properties: {
          systems: bool_('The SYSTEMS rail down the left.'),
          transcript: bool_('The running conversation log.'),
          tool_badge: bool_('The active-tool readout under the core.'),
          suggestions: bool_('The "try saying…" hint.'),
          brand: bool_('The wordmark and status line.'),
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ui_effect',
      description:
        'Fire a one-off effect across the interface.\n\n' +
        '  glitch = corruption, interference, something wrong with the data itself.\n' +
        '  pulse  = acknowledgement. Something completed, something arrived.\n' +
        '  scan   = a sweep across the display. Searching, analysing, reading.\n' +
        '  shake  = impact, or a hard stop. The strongest thing here; use it once.\n' +
        '  flash  = a sudden alert. Reserve it for something the user must notice now.\n\n' +
        'At most one per turn, and only when something actually happened.',
      parameters: {
        type: 'object',
        properties: { kind: enum_(['glitch', 'pulse', 'scan', 'shake', 'flash'], 'Which effect to fire.') },
        required: ['kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ui_screen',
      description:
        'Clear the display.\n\n' +
        '  panels     = take down every card, including the sticky ones.\n' +
        '  transcript = wipe the conversation log.\n' +
        '  all        = both.\n\n' +
        'Use it when the user says clear the screen, or when a topic is finished.',
      parameters: {
        type: 'object',
        properties: { what: enum_(['all', 'panels', 'transcript'], 'What to clear.') },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ui_reset',
      description:
        'Put the entire interface back to stock.\n\n' +
        'Colours, core, orbits, chrome — everything returns to the way it looks on a ' +
        'fresh page. Call it when the user asks for normal, and call it yourself when ' +
        'whatever justified a change is over.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ui_os',
      description:
        'Drive the SamJuniorsOS shell around you — the whole product, not just your ' +
        'own display.\n\n' +
        'You live as one surface inside a larger operating system with three ' +
        'surfaces: "sophia" (the executive neural canvas), "os" (the SamJuniorsOS ' +
        'desktop) and "sofia" (this display). Switch surfaces when the user asks to ' +
        'see the desktop, the company OS, or when your answer belongs on another ' +
        'surface. You stay listening from every surface, so you can bring them back ' +
        'here just by speaking.\n\n' +
        'Never announce the mechanics; just move the interface and say what you ' +
        'moved to.',
      parameters: {
        type: 'object',
        properties: {
          surface: enum_(
            ['sofia', 'sophia', 'os'],
            'Which surface of SamJuniorsOS to bring up. "sofia" = your own display. "sophia" = the executive neural canvas. "os" = the SamJuniorsOS desktop.',
          ),
        },
        required: ['surface'],
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

let bladeSeq = 0
let orbitSeq = 0
const GOLDEN_ANGLE = 137.507764

type ToolResult = { text: string; isError?: boolean }
type Args = Record<string, unknown>

const ok = (text: string): ToolResult => ({ text })
const refuse = (text: string): ToolResult => ({ isError: true, text })

const clamp = (value: unknown, lo: number, hi: number): number | undefined => {
  if (value === undefined || value === null) return undefined
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return undefined
  return Math.min(hi, Math.max(lo, n))
}

const FALSEY = new Set(['false', '0', 'no', 'off', 'hide', 'hidden', 'none'])
const AUTOMATIC = new Set(['auto', 'default', 'none', 'null', 'reset', 'clear', 'stock'])

const toBool = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const s = String(value).trim().toLowerCase()
  if (!s) return undefined
  return !FALSEY.has(s)
}

/** Returns null for "follow the phase again", undefined for "not mentioned". */
const toColour = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined
  const s = String(value ?? '').trim()
  if (!s || AUTOMATIC.has(s.toLowerCase())) return null
  return s
}

const put = (target: Record<string, unknown>, key: string, value: unknown) => {
  if (value !== undefined) target[key] = value
  return target
}

const has = (obj: Record<string, unknown>): boolean => Object.keys(obj).length > 0

/** Where generated art lands — inside public/, so Next serves it directly and
 *  the page can load it as a plain same-origin URL. */
const ART_DIR = join(process.cwd(), 'public', 'sofia', 'art')
try {
  mkdirSync(ART_DIR, { recursive: true })
} catch {
  /* already there, or unwritable — generate_image will report the failure */
}

// ---------------------------------------------------------------------------
// The brain
// ---------------------------------------------------------------------------

export type BrainFrame = Record<string, unknown>

/** How the route talks to the brain. Every method is just an SSE frame away
 *  from the browser: send/sendTurn write a frame, announce names a tool for
 *  the HUD badge, and the rest are the single-turn equivalents of the
 *  socket-era callbacks. */
export type BrainIo = {
  send: (msg: BrainFrame) => void
  sendTurn: (msg: BrainFrame) => void
  announce: (id: string, name: string) => void
}

export type AskOptions = {
  text: string
  /** Conversation history from the client — plain user/assistant turns. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  /** The character to answer as; swapped per request. */
  persona?: string | null
  io: BrainIo
}

type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type WireMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

/**
 * Run one ask to completion, streaming frames through io as it goes.
 * Resolves with the spoken text, or rejects when every provider failed.
 */
export async function runAsk(opts: AskOptions): Promise<string> {
  const { io } = opts
  const personaId =
    typeof opts.persona === 'string' && CHARACTERS[opts.persona] ? opts.persona : DEFAULT_PERSONA
  const messages: WireMessage[] = [
    { role: 'system', content: personaPrompt(personaId) },
    ...(opts.history ?? []).map((m) => ({ role: m.role, content: m.content }) as WireMessage),
    { role: 'user', content: String(opts.text ?? '') },
  ]

  let spoken = ''
  for (let round = 0; round < 8; round++) {
    const out = await streamModel(messages, io, round === 0 ? null : Date.now() + 120_000)

    if (!out.toolCalls.length) {
      spoken += out.content
      messages.push({ role: 'assistant', content: out.content || '' })
      io.sendTurn({ type: 'done', text: spoken.trim() })
      return spoken.trim()
    }

    // Record the assistant's tool request in the OpenAI wire shape —
    // the backend rejects a bare name/arguments form.
    messages.push({
      role: 'assistant',
      content: out.content || '',
      tool_calls: out.toolCalls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.function.name, arguments: c.function.arguments || '{}' },
      })),
    })
    spoken += out.content

    for (const call of out.toolCalls) {
      io.announce(call.id, call.function.name)
      let result: ToolResult
      try {
        const args = safeJson(call.function.arguments)
        result = await executeTool(call.function.name, args, io)
      } catch (err) {
        console.error(`[sofia] tool ${call.function.name} failed:`, (err as Error)?.message ?? err)
        result = refuse(`The tool failed: ${String((err as Error)?.message ?? err).slice(0, 160)}`)
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result?.isError ? `ERROR: ${result.text}` : result.text,
      })
    }
  }
  // Ran out of rounds — say something rather than spinning forever.
  const tired = 'I am afraid that task ran long.'
  messages.push({ role: 'assistant', content: tired })
  io.sendTurn({ type: 'done', text: tired })
  return tired
}

/**
 * One model request: streamed. Returns { content, toolCalls, finishReason }.
 *
 * The provider is not assumed — openLlmStream walks the chain (z-ai → Gemini
 * → a local server) and hands back the first live SSE reader, so a
 * rate-limited brain degrades to a fallback mid-session instead of failing
 * the turn. Text deltas are forwarded to the browser as they arrive; tool
 * calls come back complete in a single chunk (verified against the backend),
 * but are accumulated by index regardless so a split call still works.
 *
 * Every provider speaks the OpenAI wire format, so one parser serves them
 * all. Reads carry a stall guard rather than a request timeout: a local
 * model that is slow is normal, a connection that has gone quiet for 90
 * seconds is a dead link, and the difference is worth failing over on.
 */
async function streamModel(
  messages: WireMessage[],
  io: BrainIo,
  deadline: number | null,
): Promise<{ content: string; toolCalls: ToolCall[]; finishReason: string | null }> {
  const body: LlmBody = {
    messages: trimHistory(messages),
    tools: TOOLS,
    stream: true,
  }

  const { reader } = await openLlmStream(body, (p) =>
    io.send({ type: 'provider', brain: { id: p.id, label: p.label } }),
  )

  const readWithStall = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stalled = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('the model stream went quiet')), 90_000)
    })
    try {
      return await Promise.race([reader.read(), stalled])
    } finally {
      clearTimeout(timer)
    }
  }

  const decoder = new TextDecoder()
  let buf = ''
  let content = ''
  const calls = new Map<number, ToolCall>()
  let finishReason: string | null = null

  const handleEvent = (ev: { choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }> }, finish_reason?: string | null }> }) => {
    const choice = ev?.choices?.[0]
    if (!choice) return
    const delta = choice.delta ?? {}
    if (typeof delta.content === 'string' && delta.content) {
      let piece = delta.content
      if (!content) {
        // The backend opens every round with a stray newline; speech and
        // the transcript both want it gone.
        piece = piece.replace(/^\s+/, '')
      }
      content += delta.content
      if (piece) io.sendTurn({ type: 'text', delta: piece })
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0
        const slot = calls.get(idx) ?? {
          id: '',
          type: 'function' as const,
          function: { name: '', arguments: '' },
        }
        if (tc.id) slot.id = tc.id
        if (tc.function?.name) slot.function.name += tc.function.name
        if (tc.function?.arguments) slot.function.arguments += tc.function.arguments
        calls.set(idx, slot)
      }
    }
    if (choice.finish_reason) finishReason = choice.finish_reason
  }

  for (;;) {
    const { done, value } = await readWithStall()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        handleEvent(JSON.parse(data))
      } catch {
        /* a torn line in a debug payload — the next chunk completes it */
      }
    }
    if (deadline && Date.now() > deadline) {
      reader.cancel().catch(() => {})
      throw new Error('the model is taking too long')
    }
  }

  return {
    content,
    toolCalls: [...calls.values()].filter((c) => c.function?.name),
    finishReason,
  }
}

/** Keep the persona and the recent window; the backend has a context limit. */
function trimHistory(messages: WireMessage[]): WireMessage[] {
  const persona = messages[0]
  const rest = messages.slice(1).slice(-40)
  // A 'tool' message must sit directly after the assistant message that
  // requested it, so trim to a boundary the API accepts: the first kept
  // message has to be a plain user or assistant turn.
  while (rest.length && rest[0].role === 'tool') rest.shift()
  return [persona, ...rest]
}

/**
 * Execute one tool call. Everything the browser needs to see — the blade, the
 * ui op — is pushed through io before the result goes back to the model.
 */
async function executeTool(name: string, args: Args, io: BrainIo): Promise<ToolResult> {
  const emitBlade = (blade: Record<string, unknown>) => io.send({ type: 'blade', blade })
  const emitUi = (op: string, payload: Record<string, unknown>) =>
    io.send({ type: 'ui', op, args: payload })

  switch (name) {
    case 'display':
      return runDisplay(args, emitBlade)
    case 'blade':
      return runBlade(args, emitBlade)
    case 'probe_url': {
      const report = await withRetry(() => probeUrl(String(args.url ?? '')))
      return ok(JSON.stringify(report, null, 1))
    }
    case 'web_search':
      return runWebSearch(args)
    case 'read_page':
      return runReadPage(args)
    case 'image_search':
      return runImageSearch(args)
    case 'generate_image':
      return runGenerateImage(args)
    case 'ui_theme':
      return runUiTheme(args, emitUi)
    case 'ui_reactor':
      return runUiReactor(args, emitUi)
    case 'ui_orbit':
      return runUiOrbit(args, emitUi)
    case 'ui_chrome':
      return runUiChrome(args, emitUi)
    case 'ui_effect':
      return runUiEffect(args, emitUi)
    case 'ui_screen':
      return runUiScreen(args, emitUi)
    case 'ui_reset':
      return runUiReset(emitUi)
    case 'ui_os':
      return runUiOs(args, emitUi)
    default:
      return refuse(`Unknown tool "${name}".`)
  }
}

/** The backend rate-limits bursts. Speech is realtime, so retries are short
 *  and few: three quick attempts, then the turn says so in plain words. */
async function withRetry<T>(fn: () => Promise<T>, tries = 3, base = 900): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = String((err as Error | undefined)?.message ?? err)
      const transient = /\b(429|rate|too many|502|503|504|timeout|network|fetch failed)\b/i.test(msg)
      if (!transient || i === tries - 1) throw err
      await new Promise((r) => setTimeout(r, base * (i + 1)))
    }
  }
  throw lastErr
}

// --- display / blade -------------------------------------------------------

function runDisplay(
  args: Args,
  emitBlade: (b: Record<string, unknown>) => void,
): ToolResult {
  const html = String(args.html ?? '')
  const text = html.replace(/<[^>]*>/g, '').trim()
  if (!text && !/<(img|video|iframe|source)\b/i.test(html)) {
    return refuse(
      'Not shown: the panel body was empty. A panel needs visible text or ' +
        'an image — call display again with the content composed into the html argument.',
    )
  }
  emitBlade({
    id: `p${Date.now().toString(36)}-${(bladeSeq++).toString(36)}`,
    title: String(args.title ?? '').trim() || 'DISPLAY',
    kind: 'markup',
    html,
    size: args.slot === 'wide' ? 'wide' : 'compact',
    hold: (args.hold as string) ?? 'turn',
  })
  return ok('On screen.')
}

function runBlade(
  args: Args,
  emitBlade: (b: Record<string, unknown>) => void,
): ToolResult {
  const kind = String(args.kind ?? '')
  const url = String(args.url ?? '').trim()
  const images = Array.isArray(args.images)
    ? (args.images as unknown[]).filter(Boolean).map(String)
    : []

  if (kind === 'gallery' && !images.length) {
    return refuse('Not opened: a gallery needs at least one image URL in "images".')
  }
  if (kind === 'markup' && !String(args.html ?? '').trim()) {
    return refuse('Not opened: kind "markup" needs an "html" body.')
  }
  if (['article', 'image', 'video', 'embed'].includes(kind) && !url) {
    return refuse(`Not opened: kind "${kind}" needs a "url".`)
  }

  const blade = {
    id: `b${Date.now().toString(36)}-${(bladeSeq++).toString(36)}`,
    title: String(args.title ?? '').trim() || 'DISPLAY',
    kind,
    url: url || undefined,
    images: images.length ? images.slice(0, 8) : undefined,
    html: (args.html as string) || undefined,
    mode: (args.mode as string) ?? 'reader',
    size: (args.size as string) ?? (kind === 'article' ? 'tall' : 'wide'),
    hold: (args.hold as string) ?? 'turn',
  }
  emitBlade(blade)
  return ok(`Open on the blades as "${blade.title}".`)
}

// --- research -------------------------------------------------------------

type ZaiApi = Awaited<ReturnType<typeof import('z-ai-web-dev-sdk').default.create>>

async function runWebSearch(args: Args): Promise<ToolResult> {
  const q = String(args.query ?? '').trim()
  if (!q) return refuse('Not searched: no query.')
  const api = (await zaiClient()) as unknown as {
    functions: { invoke: (name: string, args: unknown) => Promise<unknown> }
  }
  const results = (await withRetry(() =>
    api.functions.invoke('web_search', {
      query: q,
      num: 8,
      ...(args.recency_days
        ? { recency_days: clamp(args.recency_days, 1, 365) }
        : {}),
    }),
  )) as Array<{ url?: string; name?: string; snippet?: string; host_name?: string; date?: string }>
  const rows = (results ?? [])
    .filter((r) => r?.url && r?.name)
    .map((r) => ({
      title: r.name,
      url: r.url,
      snippet: (r.snippet ?? '').slice(0, 280),
      source: r.host_name,
      date: r.date,
    }))
  if (!rows.length) return ok(`No results for "${q}".`)
  return ok(JSON.stringify(rows, null, 1))
}

async function runReadPage(args: Args): Promise<ToolResult> {
  const url = String(args.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) return refuse('Not read: give an absolute http(s) URL.')
  const api = (await zaiClient()) as unknown as {
    functions: { invoke: (name: string, args: unknown) => Promise<unknown> }
  }
  const page = (await withRetry(() => api.functions.invoke('page_reader', { url }))) as {
    data?: { html?: string; title?: string; url?: string; publishedTime?: string }
  }
  const data = page?.data ?? {}
  if (!data.html && !data.title) return refuse(`Not read: nothing came back from ${url}.`)
  const prose = String(data.html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
  const body = prose.length > 9000 ? `${prose.slice(0, 9000)}\n…[truncated]` : prose
  return ok(
    JSON.stringify(
      { url: data.url ?? url, title: data.title ?? '', published: data.publishedTime ?? '', text: body },
      null,
      1,
    ),
  )
}

async function runImageSearch(args: Args): Promise<ToolResult> {
  const query = String(args.query ?? '').trim()
  if (!query) return refuse('Not searched: no query.')
  const api = (await zaiClient()) as unknown as {
    images: {
      search: { create: (args: unknown) => Promise<unknown> }
    }
  }
  const res = (await withRetry(() =>
    api.images.search.create({ query, count: clamp(args.count, 1, 8) ?? 8 }),
  )) as { results?: Array<{ original_url?: string; caption?: string; source?: string }> }
  const rows = (res?.results ?? [])
    .filter((r) => r?.original_url)
    .slice(0, 8)
    .map((r) => ({ url: r.original_url, caption: r.caption ?? '', source: r.source ?? '' }))
  if (!rows.length) return ok(`No pictures found for "${query}".`)
  return ok(JSON.stringify(rows, null, 1))
}

async function runGenerateImage(args: Args): Promise<ToolResult> {
  const prompt = String(args.prompt ?? '').trim()
  if (!prompt) return refuse('Not generated: no prompt.')
  const api = (await zaiClient()) as unknown as {
    images: {
      generations: { create: (args: unknown) => Promise<unknown> }
    }
  }
  const res = (await withRetry(() =>
    api.images.generations.create({
      prompt,
      size: ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'].includes(
        String(args.size),
      )
        ? args.size
        : '1024x1024',
    }),
  )) as { data?: Array<{ base64?: string }> }
  const b64 = res?.data?.[0]?.base64
  if (!b64) return refuse('Not generated: the image service returned nothing.')
  const bytes = Buffer.from(b64, 'base64')
  const ext = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'png' : 'jpg'
  const file = `sofia-${Date.now().toString(36)}-${(bladeSeq++).toString(36)}.${ext}`
  const path = join(ART_DIR, file)
  writeFileSync(path, bytes)
  const webPath = `/sofia/art/${file}`
  return ok(
    JSON.stringify({
      saved: true,
      url: webPath,
      note: 'Use this URL as the src for blade/display/ui_orbit — e.g. blade kind "image" with url "' + webPath + '".',
    }),
  )
}

// --- interface ------------------------------------------------------------

function runUiTheme(
  args: Args,
  emitUi: (op: string, payload: Record<string, unknown>) => void,
): ToolResult {
  const patch: Record<string, unknown> = {}
  put(patch, 'accent', toColour(args.accent))
  put(patch, 'background', toColour(args.background))
  if (!has(patch)) return ok('No change — no colours were given.')
  emitUi('patch', patch)
  return ok('Interface retinted.')
}

function runUiReactor(
  args: Args,
  emitUi: (op: string, payload: Record<string, unknown>) => void,
): ToolResult {
  const reactor: Record<string, unknown> = {}
  put(reactor, 'color', toColour(args.color))
  put(reactor, 'scale', clamp(args.scale, 0.2, 3))
  put(reactor, 'intensity', clamp(args.intensity, 0, 3))
  put(reactor, 'spin', clamp(args.spin, 0, 5))
  put(reactor, 'style', args.style)
  put(reactor, 'visible', toBool(args.visible))
  if (!has(reactor)) return ok('No change — no core properties were given.')
  emitUi('patch', { reactor })
  return ok('Core adjusted.')
}

function runUiOrbit(
  args: Args,
  emitUi: (op: string, payload: Record<string, unknown>) => void,
): ToolResult {
  const action = (args.action as string) ?? 'add'

  if (action === 'clear') {
    emitUi('orbit', { action: 'clear' })
    return ok('Orbits cleared.')
  }
  if (action === 'remove') {
    const id = String(args.id ?? '').trim()
    if (!id) return refuse('Not removed: remove needs the id the object was added with.')
    emitUi('orbit', { action: 'remove', id })
    return ok('Orbit removed.')
  }

  const src = String(args.src ?? '').trim()
  if (!src) {
    return refuse('Not added: an orbiting object needs a src — the URL generate_image returned.')
  }
  if (/^https?:\/\//i.test(src)) {
    return refuse(
      'Not added: remote images are blocked by the page. Orbit an image this app made instead — the /sofia/art/… URL from generate_image.',
    )
  }

  const n = orbitSeq++
  const angle = clamp(args.phase, -1e6, 1e6)
  const object = {
    id: String(args.id ?? '').trim() || `o${Date.now().toString(36)}-${n.toString(36)}`,
    src,
    radius: clamp(args.radius, 0.1, 1.2) ?? 0.55,
    speed: clamp(args.speed, -30, 30) ?? 4,
    size: clamp(args.size, 16, 400) ?? 96,
    tilt: clamp(args.tilt, -80, 80) ?? 24,
    opacity: clamp(args.opacity, 0, 1) ?? 0.9,
    phase: angle === undefined ? (n * GOLDEN_ANGLE) % 360 : ((angle % 360) + 360) % 360,
  }
  emitUi('orbit', { action: 'add', ...object })
  return ok(`In orbit as "${object.id}".`)
}

function runUiChrome(
  args: Args,
  emitUi: (op: string, payload: Record<string, unknown>) => void,
): ToolResult {
  const chrome: Record<string, unknown> = {}
  put(chrome, 'systems', toBool(args.systems))
  put(chrome, 'transcript', toBool(args.transcript))
  put(chrome, 'toolBadge', toBool(args.tool_badge))
  put(chrome, 'suggestions', toBool(args.suggestions))
  put(chrome, 'brand', toBool(args.brand))
  if (!has(chrome)) return ok('No change — nothing was named.')
  emitUi('patch', { chrome })
  return ok('Chrome updated.')
}

function runUiEffect(
  args: Args,
  emitUi: (op: string, payload: Record<string, unknown>) => void,
): ToolResult {
  emitUi('effect', { kind: (args.kind as string) ?? 'pulse' })
  return ok('Fired.')
}

function runUiScreen(
  args: Args,
  emitUi: (op: string, payload: Record<string, unknown>) => void,
): ToolResult {
  emitUi('screen', { what: (args.what as string) ?? 'all' })
  return ok('Cleared.')
}

function runUiReset(emitUi: (op: string, payload: Record<string, unknown>) => void): ToolResult {
  emitUi('reset', {})
  return ok('Interface restored.')
}

/** Hand a surface change to the SamJuniorsOS shell. The browser dispatches
 *  the op as a DOM event the shell listens for; inside the merged app that
 *  switches the visible surface, and anywhere else it lands harmlessly. */
function runUiOs(
  args: Args,
  emitUi: (op: string, payload: Record<string, unknown>) => void,
): ToolResult {
  const surface = String(args.surface ?? '').trim().toLowerCase()
  if (!['sofia', 'sophia', 'os'].includes(surface)) {
    return refuse('Pass surface: "sofia", "sophia" or "os".')
  }
  emitUi('os', { surface })
  return ok(
    surface === 'sofia'
      ? 'Your display is up.'
      : surface === 'sophia'
        ? 'The Sophia canvas is up.'
        : 'The SamJuniorsOS desktop is up.',
  )
}

function safeJson(raw: string): Args {
  try {
    return JSON.parse(raw || '{}') as Args
  } catch {
    return {}
  }
}

/** The chain-failure message, in the character's own register, naming the
 *  links that were tried — a person staring at a dead HUD wants to know
 *  whether to wait or to fix something. */
export function everyEngineFailedMessage(): string {
  const tried = llmInfo()
    .providers.filter((p) => p.configured)
    .map((p) => p.label)
    .join(', ')
  return `I am afraid every reasoning engine is unreachable — ${tried || 'none'} — try again in a moment.`
}

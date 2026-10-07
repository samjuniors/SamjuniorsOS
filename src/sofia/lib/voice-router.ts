/**
 * lib/voice-router.ts — who speaks and who listens, decided once (Phase 9).
 *
 * One policy for every voice path: cloud (Gemini Live → Deepgram → ElevenLabs
 * → browser TTS), local (companion Whisper/Piper), or AUTO with fallback in
 * BOTH directions — cloud keys become an upgrade, never a requirement, and a
 * cloud outage degrades into airplane mode instead of silence.
 *
 * Pure decision core; UI + ConversationManager consume it.
 */

export type VoiceRouteId = 'gemini-live' | 'deepgram' | 'elevenlabs' | 'local' | 'browser-tts';
export type VoiceMode = 'auto' | 'cloud' | 'local';

export interface RouteInput {
  mode: VoiceMode;
  airplane: boolean;
  hasGeminiKey: boolean;
  hasDeepgramKey: boolean;
  hasElevenlabsKey: boolean;
  companionConnected: boolean;
  localTts: boolean;
  localStt: boolean;
  localBrain: boolean;
}

export interface RouteLeg {
  id: VoiceRouteId;
  label: string;
  /** True when this leg can hear (STT) AND answer (brain) AND speak (TTS). */
  full: boolean;
  /** What this leg covers when only partially ready. */
  caps: { stt: boolean; brain: boolean; tts: boolean };
}

const MODE_KEY = 'sophia:voice-mode:v1';

export function loadVoiceMode(): VoiceMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'cloud' || v === 'local') return v;
  } catch { /* ignore */ }
  return 'auto';
}

export function saveVoiceMode(mode: VoiceMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
}

function cloudLegs(i: RouteInput): RouteLeg[] {
  const legs: RouteLeg[] = [];
  if (i.hasGeminiKey) {
    legs.push({ id: 'gemini-live', label: 'Gemini Live', full: true, caps: { stt: true, brain: true, tts: true } });
  }
  if (i.hasDeepgramKey) {
    legs.push({ id: 'deepgram', label: 'Deepgram voice', full: true, caps: { stt: true, brain: true, tts: true } });
  }
  if (i.hasElevenlabsKey) {
    legs.push({ id: 'elevenlabs', label: 'ElevenLabs voice', full: false, caps: { stt: true, brain: true, tts: true } });
  }
  return legs;
}

function localLegs(i: RouteInput): RouteLeg[] {
  const legs: RouteLeg[] = [];
  if (i.companionConnected && (i.localTts || i.localStt || i.localBrain)) {
    legs.push({
      id: 'local',
      label: 'Local (on-device)',
      full: i.localTts && i.localStt && i.localBrain,
      caps: { stt: i.localStt, brain: i.localBrain, tts: i.localTts },
    });
  }
  // Browser speechSynthesis is the last-ditch mouth for any chain.
  legs.push({ id: 'browser-tts', label: 'Browser voice', full: false, caps: { stt: false, brain: false, tts: true } });
  return legs;
}

/**
 * Ordered route chain for the current world state. First leg = primary;
 * the rest are the fallbacks the UI displays and the conversation loop uses
 * when a leg fails at runtime.
 */
export function planRoutes(i: RouteInput): RouteLeg[] {
  const cloud = cloudLegs(i);
  const local = localLegs(i);

  // Airplane mode (or explicit local) never reaches for the cloud.
  if (i.airplane || i.mode === 'local') return local;
  // Explicit cloud: cloud chain only, browser TTS as last resort.
  if (i.mode === 'cloud') {
    return [...cloud, ...local.filter((l) => l.id === 'browser-tts')];
  }
  // AUTO: both directions. Keys present → cloud first; none → local first.
  return cloud.length > 0 ? [...cloud, ...local] : [...local];
}

/** Primary route = first leg that can hold a full conversation. */
export function pickPrimary(routes: RouteLeg[]): RouteLeg {
  return routes.find((r) => r.full) ?? routes[0];
}

/** Next leg to try after `failedId` failed at runtime. */
export function nextFallback(routes: RouteLeg[], failedId: VoiceRouteId): RouteLeg | null {
  const idx = routes.findIndex((r) => r.id === failedId);
  if (idx < 0) return null;
  return routes[idx + 1] ?? null;
}

/** Human-readable chain for the UI: "Gemini Live → Local (on-device) → Browser voice". */
export function describeChain(routes: RouteLeg[]): string {
  return routes.map((r) => r.label).join(' → ') || 'No voice path available';
}

/** Minimal shape of /api/sophia/status we consume (kept loose on purpose). */
export interface StatusLike {
  gemini?: boolean;
  deepgram?: boolean;
  elevenlabs?: boolean;
}

export interface LocalReadinessLike {
  companion: boolean;
  tts: boolean;
  stt: boolean;
  brain: boolean;
}

/** Assemble a RouteInput from live status + local readiness. Pure. */
export function routeInputFrom(
  status: StatusLike | null,
  local: LocalReadinessLike | null,
  mode: VoiceMode,
  airplane: boolean,
): RouteInput {
  return {
    mode,
    airplane,
    hasGeminiKey: Boolean(status?.gemini),
    hasDeepgramKey: Boolean(status?.deepgram),
    hasElevenlabsKey: Boolean(status?.elevenlabs),
    companionConnected: Boolean(local?.companion),
    localTts: Boolean(local?.tts),
    localStt: Boolean(local?.stt),
    localBrain: Boolean(local?.brain),
  };
}

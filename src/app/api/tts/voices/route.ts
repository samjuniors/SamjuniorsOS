import { NextResponse } from 'next/server';

/** Popular high-quality ElevenLabs presets */
const PRESET_VOICES = [
  { voice_id: 'bMxLr8fP6hzNRRi9nJxU', name: 'George (Jarvis / Sophisticated British)', category: 'premade' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Deep & Confident Male)', category: 'premade' },
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Calm & Professional Female)', category: 'premade' },
  { voice_id: 'piTKgcLEGmPE4e6mEKli', name: 'Nicole (Whisper & Warm Female)', category: 'premade' },
  { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George V1 (Warm British Storyteller)', category: 'premade' },
  { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Empathetic & Strong Female)', category: 'premade' },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Expressive & Friendly Female)', category: 'premade' },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Well-rounded & Crisp Male)', category: 'premade' },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Crisp & Articulate Male)', category: 'premade' },
];

/**
 * GET /api/tts/voices
 * Lists available ElevenLabs voices for the current user key, with fallback to curated presets.
 */
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const configuredDefault = process.env.JARVIS_VOICE_ID || 'bMxLr8fP6hzNRRi9nJxU';

  if (!apiKey) {
    return NextResponse.json({
      success: true,
      hasKey: false,
      defaultVoiceId: configuredDefault,
      voices: PRESET_VOICES,
    });
  }

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      const rawVoices = Array.isArray(data.voices) ? data.voices : [];
      const remoteVoices = rawVoices.map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category || 'custom',
        preview_url: v.preview_url,
      }));

      // Merge remote voices and presets, avoiding duplicate IDs
      const seen = new Set<string>();
      const combined = [...remoteVoices, ...PRESET_VOICES].filter((v) => {
        if (seen.has(v.voice_id)) return false;
        seen.add(v.voice_id);
        return true;
      });

      return NextResponse.json({
        success: true,
        hasKey: true,
        defaultVoiceId: configuredDefault,
        voices: combined,
      });
    }
  } catch (err) {
    console.warn('[ElevenLabs Voices] Failed to fetch live voices, using presets:', err);
  }

  return NextResponse.json({
    success: true,
    hasKey: true,
    defaultVoiceId: configuredDefault,
    voices: PRESET_VOICES,
  });
}

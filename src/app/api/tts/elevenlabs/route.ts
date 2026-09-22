import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/tts/elevenlabs
 * Streams text-to-speech audio from ElevenLabs using the configured API key and voice ID.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ error: 'Text is required', success: false }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ELEVENLABS_API_KEY is not configured in server environment', success: false },
        { status: 500 }
      );
    }

    // Default voice: George ("bMxLr8fP6hzNRRi9nJxU") or configured JARVIS_VOICE_ID
    const defaultVoiceId = process.env.JARVIS_VOICE_ID || 'bMxLr8fP6hzNRRi9nJxU';
    const voiceId = typeof body.voiceId === 'string' && body.voiceId.trim() ? body.voiceId.trim() : defaultVoiceId;
    const modelId = typeof body.modelId === 'string' ? body.modelId : 'eleven_flash_v2_5';

    const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`;

    const elevenRes = await fetch(elevenUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => '');
      console.error('[ElevenLabs TTS] Upstream error:', elevenRes.status, errText);
      return NextResponse.json(
        { error: `ElevenLabs returned ${elevenRes.status}: ${errText.slice(0, 200)}`, success: false },
        { status: elevenRes.status }
      );
    }

    const audioStream = elevenRes.body;
    if (!audioStream) {
      return NextResponse.json({ error: 'No audio stream returned', success: false }, { status: 500 });
    }

    return new Response(audioStream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'X-ElevenLabs-Voice': voiceId,
      },
    });
  } catch (err: any) {
    console.error('[ElevenLabs TTS] Route failure:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error in TTS stream', success: false },
      { status: 500 }
    );
  }
}

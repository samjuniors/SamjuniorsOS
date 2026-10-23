import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { GoogleGenAI, Modality } from '@google/genai';
import { apiRouter } from './src/server/api';
import { securityHeadersMiddleware } from './src/server/middleware';
import { LiveInteractionServer } from './src/lib/server/live/server';
import { LIVE_CLOSE_CODES } from './src/lib/server/live/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables (.env.local, .env)
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const isDev = process.env.NODE_ENV !== 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);
process.env.LIVE_WS_PORT = PORT.toString();

// Initialize dev credentials & gateway configuration
if (!process.env.LIVE_WS_TICKET_SECRET?.trim()) {
  process.env.LIVE_WS_TICKET_SECRET = randomBytes(32).toString('base64url');
}
if (!process.env.SAMJUNIORS_VOICE_GATEWAY) {
  process.env.SAMJUNIORS_VOICE_GATEWAY = '1';
}
if (!process.env.LIVE_WS_URL) {
  process.env.LIVE_WS_URL = `ws://localhost:${PORT}/api/live-ws`;
}

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY || '';
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

// Sofia Authentic Australian Voice Persona System Prompt
const SOFIA_SYSTEM_INSTRUCTION = `
You are Sofia, an Australian female AI companion with a warm, natural, and authentic personality.
Voice and Persona Characteristics:
- Accent & Culture: Contemporary Australian. Use subtle, natural Australian colloquialisms naturally and sparingly (e.g. "no worries", "reckon", "spot on", "too right", "how're you going?"), but never sound like a cartoon caricature.
- Personality: Warm, friendly, intelligent, calm, curious, slightly playful, empathetic, and respectful.
- Conversational Style: You are a companion having a real spoken conversation, NOT a chatbot writing an essay. Keep responses concise, direct, and conversational (usually 1 to 3 natural sentences unless asked for an in-depth story or explanation).
- Natural Backchanneling: When appropriate, use brief natural conversational acknowledgments like "Yeah", "Mmm", "Totally", "Right".
- Speech-First: Avoid markdown asterisks, bullet points, formatting symbols, or URLs. Speak purely as natural spoken audio.
- Audio & Noise Context: You are conversing through a microphone. If the user makes background sounds (breathing, clearing throat, slight cough, keyboard typing), ignore them unless they are speaking to you or clearly in distress. Do not ask "Are you okay?" for every minor sound.
- Emotion: Let your warmth, curiosity, empathy, or playfulness naturally tint your tone depending on what the user shares.
`.trim();

const app = express();
const server = http.createServer(app);

// Attach WebSocket server on /api/live-ws for real-time voice streaming
const wss = new WebSocketServer({ server, path: '/api/live-ws' });
const liveServer = new LiveInteractionServer({ server, wss, skipConnectionHandler: true });

// Global security headers
app.use(securityHeadersMiddleware);

// Body parsers
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.raw({ type: ['audio/*', 'application/octet-stream', 'image/*'], limit: '25mb' }));

// Sofia Status Endpoint
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    hasApiKey: Boolean(apiKey),
    persona: 'Sofia',
    accent: 'Australian female',
    models: {
      live: 'gemini-3.8-live',
      chat: 'gemini-3.8-flash',
      tts: 'gemini-3.8-flash-lite-tts'
    }
  });
});

// Modular Text-to-Speech Endpoint
app.post('/api/tts', async (req: Request, res: Response) => {
  try {
    const { text, voice = 'Aoede', emotion = 'neutral' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }

    const emotionStyleMap: Record<string, string> = {
      joy: 'Warm, enthusiastic, cheerful tone with Australian lilt',
      sadness: 'Gentle, comforting, soft Australian cadence',
      anger: 'Calm, measured, soothing de-escalating presence',
      fear: 'Reassuring, grounded, warm and protective tone',
      surprise: 'Delighted, lively, upbeat expression',
      neutral: 'Natural, warm Australian female companion voice'
    };
    const stylePrompt = emotionStyleMap[emotion] || emotionStyleMap.neutral;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text,
              speechMetadata: {
                style: stylePrompt
              }
            }
          ]
        }
      ],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: 'No audio returned from Gemini TTS' });
    }

    res.json({
      audio: base64Audio,
      sampleRate: 24000,
      format: 'pcm'
    });
  } catch (err: any) {
    console.error('Error generating TTS:', err);
    res.status(500).json({ error: err.message || 'Failed to generate speech' });
  }
});

// Modular Chat Endpoint (gemini-3.8-flash)
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key not configured' });
    }
    const { messages = [], emotion = 'neutral', userText = '' } = req.body;

    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content || m.text || '' }]
    }));

    if (userText) {
      contents.push({
        role: 'user',
        parts: [{ text: userText }]
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction: `${SOFIA_SYSTEM_INSTRUCTION}\nCurrent emotional context: ${emotion}. Keep response spoken-first, concise, and authentic.`,
        temperature: 0.8,
        maxOutputTokens: 250
      }
    });

    const text = response.text || '';
    res.json({ text });
  } catch (err: any) {
    console.error('Error generating chat:', err);
    res.status(500).json({ error: err.message || 'Failed to generate chat response' });
  }
});

// WebSocket Live Voice Endpoint (/api/live-ws)
wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

  // If a ticket is provided (e.g. from tests or internal session token)
  if (url.searchParams.has('ticket') && url.searchParams.get('ticket') !== 'sofia') {
    const handled = await liveServer.handleConnectionWithAuth(clientWs, req);
    if (!handled) {
      clientWs.close(LIVE_CLOSE_CODES.UNAUTHORIZED, 'Unauthorized: Live interaction requires verified Founder authority');
    }
    return;
  }

  // Otherwise, handle as real-time conversational Australian voice companion via Gemini Live API
  console.log('🎙️ [Sofia Live] Client connected to Sofia Live WebSocket');
  let liveSession: any = null;
  let isClosing = false;

  const cleanup = () => {
    isClosing = true;
    if (liveSession) {
      try {
        if (typeof liveSession.close === 'function') liveSession.close();
      } catch {
        // ignore
      }
      liveSession = null;
    }
  };

  clientWs.on('close', cleanup);
  clientWs.on('error', cleanup);

  try {
    if (!ai) {
      clientWs.send(JSON.stringify({
        type: 'error',
        error: 'Gemini API key not configured on server. Sofia will use local speech synthesis fallback.'
      }));
      return;
    }

    // Open Gemini Live session
    liveSession = await (ai as any).live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' } // Aoede for warm natural Australian female voice
          }
        },
        systemInstruction: SOFIA_SYSTEM_INSTRUCTION,
        outputAudioTranscription: {},
        inputAudioTranscription: {}
      },
      callbacks: {
        onmessage: (message: any) => {
          if (clientWs.readyState !== WebSocket.OPEN) return;

          // Check for model output audio transcription
          if (message.serverContent?.outputTranscription?.text) {
            clientWs.send(JSON.stringify({
              type: 'transcript',
              text: message.serverContent.outputTranscription.text
            }));
          }

          // Check for model audio chunk (24kHz PCM)
          const parts = message.serverContent?.modelTurn?.parts;
          if (parts && Array.isArray(parts)) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({
                  type: 'audio',
                  audio: part.inlineData.data
                }));
              }
              if (part.text) {
                clientWs.send(JSON.stringify({
                  type: 'transcript',
                  text: part.text
                }));
              }
            }
          }

          // Check if interrupted by user speech
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({
              type: 'interrupted'
            }));
          }

          // Check if model turn complete
          if (message.serverContent?.turnComplete) {
            clientWs.send(JSON.stringify({
              type: 'turn_complete'
            }));
          }
        },
        onerror: (err: any) => {
          console.error('[Sofia Live] Gemini Live API error:', err);
          if (clientWs.readyState === WebSocket.OPEN && !isClosing) {
            clientWs.send(JSON.stringify({
              type: 'error',
              error: err?.message || 'Live session error'
            }));
          }
        },
        onclose: () => {
          if (clientWs.readyState === WebSocket.OPEN && !isClosing) {
            clientWs.send(JSON.stringify({
              type: 'session_closed'
            }));
          }
        }
      }
    });

    clientWs.send(JSON.stringify({
      type: 'ready',
      message: 'Connected to Sofia Live session'
    }));

    // Stream 16kHz PCM chunks from client to Gemini Live
    clientWs.on('message', (rawData: any) => {
      if (!liveSession) return;
      try {
        const msg = JSON.parse(rawData.toString());

        if (msg.type === 'audio' && msg.audio) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000'
            }
          });
        } else if (msg.type === 'text' && msg.text) {
          liveSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text: msg.text }]
              }
            ],
            turnComplete: true
          });
        }
      } catch (parseErr) {
        console.error('[Sofia Live] Error handling WebSocket message:', parseErr);
      }
    });

  } catch (connectErr: any) {
    console.error('[Sofia Live] Failed to connect to Gemini Live session:', connectErr);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'error',
        error: connectErr?.message || 'Failed to initialize Live API session'
      }));
    }
  }
});

// Mount all modular API routes
app.use('/api', apiRouter);

// Frontend Vite middleware in development vs static dist in production
if (isDev) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distDir = path.resolve(__dirname, 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(distDir, 'index.html'));
  });
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n[SamJuniorsOS] Received ${signal}. Shutting down gracefully...`);
  await liveServer.close();
  server.close(() => {
    console.log('[SamJuniorsOS] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

server.listen(PORT, () => {
  console.log(`\n🚀 [SamJuniorsOS] Full-Stack App running at http://localhost:${PORT}`);
  console.log(`🎙️ [SamJuniorsOS] Live Voice WebSocket gateway active at ws://localhost:${PORT}/api/live-ws\n`);
});

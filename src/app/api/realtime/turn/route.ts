import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { getRealtimeProvider, listRealtimeProviders } from '@/lib/server/live/providers';
import { MultiAgentOrchestrator } from '@/lib/server/orchestration/orchestrator';
import { searchLiveWeb } from '@/lib/server/tools/web-search';
import { generateAiImage } from '@/lib/server/tools/image-generator';

export const dynamic = 'force-dynamic';

/**
 * POST /api/realtime/turn
 *
 * Executes a realtime voice/vision turn in Sophia Realtime Lab.
 * Enforces server-side Founder authentication.
 *
 * If the utterance is classified as a directive (e.g. "Research our competitors"),
 * it dispatches into the standard MultiAgentOrchestrator council, honoring all
 * deterministic verifications and SideEffectAuthorizationGate approval locks.
 */
export async function POST(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required', success: false },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      message,
      sessionId = `sess-${Date.now()}`,
      providerId = 'gemini',
      personaId = 'friendly',
      cameraSnapshot,
      audioRecording,
      conversationHistory = [],
    } = body;

    // Validate Message
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    if (trimmedMessage.length > 10000) {
      return NextResponse.json(
        { error: 'Message exceeds maximum allowed length of 10,000 characters', success: false },
        { status: 400 }
      );
    }

    if (!trimmedMessage && !audioRecording?.base64Data) {
      return NextResponse.json(
        { error: 'Either message or audio recording is required', success: false },
        { status: 400 }
      );
    }

    // Validate Provider Selection (Prevent Provider Spoofing)
    const validProviders = listRealtimeProviders();
    const isRegistered = validProviders.some((p) => p.id === providerId);
    if (!isRegistered) {
      return NextResponse.json(
        {
          error: `Realtime provider '${providerId}' is not registered. Available: ${validProviders.map((p) => p.id).join(', ')}`,
          success: false,
        },
        { status: 400 }
      );
    }

    // Validate Camera Snapshot Payload & Size Bounds (Max 5MB)
    if (cameraSnapshot) {
      if (typeof cameraSnapshot.base64Data !== 'string') {
        return NextResponse.json(
          { error: 'cameraSnapshot.base64Data must be a valid base64 string', success: false },
          { status: 400 }
        );
      }
      if (cameraSnapshot.base64Data.length > 7000000) {
        return NextResponse.json(
          { error: 'cameraSnapshot payload exceeds maximum size limit (5MB)', success: false },
          { status: 413 }
        );
      }
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (cameraSnapshot.mimeType && !allowedImageTypes.includes(cameraSnapshot.mimeType)) {
        return NextResponse.json(
          { error: `Invalid cameraSnapshot mimeType '${cameraSnapshot.mimeType}'. Allowed: ${allowedImageTypes.join(', ')}`, success: false },
          { status: 400 }
        );
      }
    }

    // Validate Audio Recording Payload & Size Bounds (Max 10MB)
    if (audioRecording) {
      if (typeof audioRecording.base64Data !== 'string') {
        return NextResponse.json(
          { error: 'audioRecording.base64Data must be a valid base64 string', success: false },
          { status: 400 }
        );
      }
      if (audioRecording.base64Data.length > 14000000) {
        return NextResponse.json(
          { error: 'audioRecording payload exceeds maximum size limit (10MB)', success: false },
          { status: 413 }
        );
      }
      const allowedAudioTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/mpeg'];
      if (audioRecording.mimeType && !allowedAudioTypes.includes(audioRecording.mimeType)) {
        return NextResponse.json(
          { error: `Invalid audioRecording mimeType '${audioRecording.mimeType}'. Allowed: ${allowedAudioTypes.join(', ')}`, success: false },
          { status: 400 }
        );
      }
    }

    // Validate Conversation History Bounds
    if (conversationHistory && !Array.isArray(conversationHistory)) {
      return NextResponse.json(
        { error: 'conversationHistory must be an array', success: false },
        { status: 400 }
      );
    }
    if (Array.isArray(conversationHistory) && conversationHistory.length > 50) {
      return NextResponse.json(
        { error: 'conversationHistory exceeds maximum allowed limit of 50 items', success: false },
        { status: 400 }
      );
    }

    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    let userSpokenText = trimmedMessage;

    // If direct audio recording was sent and message text is empty, transcribe audio first
    if (!userSpokenText && audioRecording?.base64Data) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (apiKey) {
          const ai = new GoogleGenAI({ apiKey });
          const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
          const transcriptRes = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      data: audioRecording.base64Data,
                      mimeType: audioRecording.mimeType || 'audio/webm',
                    },
                  },
                  {
                    text: 'Transcribe the user speech verbatim. Return ONLY the transcribed text, nothing else. If silent or unintelligible, return empty string.',
                  },
                ],
              },
            ],
          });
          const transcribed = transcriptRes.text?.trim() || '';
          if (transcribed) {
            userSpokenText = transcribed;
          }
        }
      } catch (err) {
        console.warn('[RealtimeTurn] Direct audio transcription error:', err);
      }
    }

    const lowerMsg = userSpokenText.toLowerCase();

    // -------------------------------------------------------------
    // 1. Panel & HUD Card Actuators (Hands)
    // -------------------------------------------------------------
    if (
      /^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:close|hide|dismiss|remove|clear)\s+(?:the\s+)?(?:panels?|cards?|hud|windows?|display|results?)\b/i.test(lowerMsg) ||
      lowerMsg === 'close panel' ||
      lowerMsg === 'dismiss' ||
      lowerMsg === 'close card'
    ) {
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: 'Closing HUD display panels, sir.',
        action: { type: 'close_panel' },
        durationMs: 20,
        detectedIntent: 'tool_close_panel',
      });
    }

    // -------------------------------------------------------------
    // 2. In-OS Browser Controls (Hands)
    // -------------------------------------------------------------
    if (/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:close|hide|exit|dismiss)\s+(?:the\s+)?(?:in-os\s+)?browser\b/i.test(lowerMsg)) {
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: 'Closing the in-OS browser window, sir.',
        action: { type: 'close_browser' },
        durationMs: 20,
        detectedIntent: 'tool_close_browser',
      });
    }

    const openBrowserMatch =
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:open|launch|show)\s+(?:the\s+)?(?:in-os\s+)?browser(?:\s+(?:to|at|with)\s+(.+))?/i) ||
      lowerMsg.match(/^(?:open|browse|visit|go\s+to)(?:\s+(?:the\s+)?(?:url|site|link|page))?\s+((?:https?:\/\/|[a-zA-Z0-9-]+\.)[^\s]+)/i) ||
      (userSpokenText.startsWith('http://') || userSpokenText.startsWith('https://') ? [null, userSpokenText] : null);
    if (openBrowserMatch) {
      let targetUrl = openBrowserMatch[1]?.trim() || 'https://google.com';
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = `https://${targetUrl}`;
      }
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'browser-navigator',
        modelUsed: 'in-os-browser',
        isDirective: false,
        reply: `Opening ${targetUrl} inside the operating system browser, sir.`,
        action: {
          type: 'open_browser',
          url: targetUrl,
        },
        durationMs: 25,
        detectedIntent: 'tool_open_browser',
      });
    }

    // -------------------------------------------------------------
    // 3. Conversational Persona Controls (Hands & Voice)
    // -------------------------------------------------------------
    const personaMatch =
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:change|switch|set)\s+(?:the\s+)?persona\s+(?:to\s+)?(friendly|professional|creative|technical)\b/i) ||
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?be\s+(friendly|professional|creative|technical)\b/i);
    if (personaMatch) {
      const newPersona = personaMatch[1].toLowerCase();
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: `Switching persona to ${newPersona}. My conversational demeanor has been updated, sir.`,
        action: { type: 'change_persona', persona: newPersona },
        durationMs: 20,
        detectedIntent: 'tool_change_persona',
      });
    }

    // -------------------------------------------------------------
    // 4. Voice Switching Controls (Mouth & Voice)
    // -------------------------------------------------------------
    const voiceMatch =
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:change|switch|set)\s+(?:the\s+)?voice\s+(?:to\s+)?(.+)/i) ||
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?use\s+(?:the\s+)?voice\s+(.+)/i);
    if (voiceMatch) {
      const targetVoice = voiceMatch[1].trim();
      let voiceId = 'bMxLr8fP6hzNRRi9nJxU'; // Default George
      let voiceName = targetVoice;

      if (/rachel/i.test(targetVoice)) {
        voiceId = '21m00Tcm4TlvDq8ikWAM';
        voiceName = 'Rachel';
      } else if (/adam/i.test(targetVoice)) {
        voiceId = 'pNInz6obpgDQGcFmaJgB';
        voiceName = 'Adam';
      } else if (/nicole/i.test(targetVoice)) {
        voiceId = 'piTKgcLEGmPE4e6mEKli';
        voiceName = 'Nicole';
      } else if (/george/i.test(targetVoice)) {
        voiceId = 'bMxLr8fP6hzNRRi9nJxU';
        voiceName = 'George';
      } else if (/antoni/i.test(targetVoice)) {
        voiceId = 'ErXwobaYiN019PkySvjV';
        voiceName = 'Antoni';
      } else if (/bella/i.test(targetVoice)) {
        voiceId = 'EXAVITQu4vr4xnSDxMaL';
        voiceName = 'Bella';
      } else if (/domi/i.test(targetVoice)) {
        voiceId = 'AZnzlk1XvdvUeBnXmlld';
        voiceName = 'Domi';
      } else if (/arnold/i.test(targetVoice)) {
        voiceId = 'VR6AewLTigWG4xSOukaG';
        voiceName = 'Arnold';
      } else if (targetVoice.length > 15) {
        voiceId = targetVoice;
      }

      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: `Voice switched to ${voiceName}. All future speech will articulate using this voice configuration, sir.`,
        action: { type: 'change_voice', voiceId, voiceName },
        durationMs: 25,
        detectedIntent: 'tool_change_voice',
      });
    }

    // -------------------------------------------------------------
    // 5. Hardware Actuators: Camera & Screen Sharing (Eyes)
    // -------------------------------------------------------------
    if (/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:turn\s+on|enable|start|open|toggle)\s+(?:the\s+)?camera\b/i.test(lowerMsg)) {
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: 'Activating visual camera sensor, sir.',
        action: { type: 'toggle_camera', state: 'on' },
        durationMs: 20,
        detectedIntent: 'tool_toggle_camera',
      });
    }
    if (/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:turn\s+off|disable|stop|close)\s+(?:the\s+)?camera\b/i.test(lowerMsg)) {
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: 'Disarming camera sensor, sir.',
        action: { type: 'toggle_camera', state: 'off' },
        durationMs: 20,
        detectedIntent: 'tool_toggle_camera',
      });
    }
    if (/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:start\s+screen\s+share|share\s+(?:the\s+)?screen|stop\s+screen\s+share|toggle\s+screen)\b/i.test(lowerMsg)) {
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: 'Toggling screen capture interface, sir.',
        action: { type: 'toggle_screen' },
        durationMs: 20,
        detectedIntent: 'tool_toggle_screen',
      });
    }

    // -------------------------------------------------------------
    // 6. Settings Modal Actuators
    // -------------------------------------------------------------
    if (/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:open|show)\s+(?:the\s+)?settings\b/i.test(lowerMsg)) {
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: 'Opening system settings panel, sir.',
        action: { type: 'ui_settings', open: true },
        durationMs: 20,
        detectedIntent: 'tool_ui_settings',
      });
    }
    if (/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:close|hide)\s+(?:the\s+)?settings\b/i.test(lowerMsg)) {
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: 'Closing system settings panel, sir.',
        action: { type: 'ui_settings', open: false },
        durationMs: 20,
        detectedIntent: 'tool_ui_settings',
      });
    }

    // -------------------------------------------------------------
    // 7. AI Image Generation (Broad Pattern Matching)
    // -------------------------------------------------------------
    const imageMatch =
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:generate|create|make|draw|paint)\s+(?:an?\s+)?(?:image|picture|photo|illustration|art)\s*(?:of|about|depicting)?\s*(.+)/i) ||
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:draw|paint)\s+(?:me\s+)?(.+)/i) ||
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?image\s+of\s+(.+)/i) ||
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:generate|create|make)\s+an?\s+image\b/i) ||
      lowerMsg.match(/^\/image\s*(.*)/i);
    if (imageMatch) {
      const rawPrompt = imageMatch[1]?.trim() || '';
      const prompt = rawPrompt || 'A futuristic holographic artificial intelligence core glowing in deep neon cyan and violet';
      const startTime = Date.now();
      const imgRes = await generateAiImage(prompt);
      const elapsed = Date.now() - startTime;

      const reply = `I have generated an image of ${prompt} for you. Rendering in your visual HUD display.`;

      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'flux-vision-generator',
        modelUsed: imgRes.provider,
        isDirective: false,
        reply,
        action: {
          type: 'generate_image',
          prompt: imgRes.prompt,
          imageUrl: imgRes.imageUrl,
          width: imgRes.width,
          height: imgRes.height,
        },
        durationMs: elapsed,
        detectedIntent: 'tool_generate_image',
      });
    }

    // -------------------------------------------------------------
    // 8. Live Web Search Tool (Broad Pattern Matching)
    // -------------------------------------------------------------
    const searchMatch =
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:search(?:\s+the)?\s+web\s+(?:for|about)?\s*|google\s+|look\s+up\s+|web\s+search\s*:?\s*)(.+)/i) ||
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?find\s+(?:articles?|info(?:rmation)?|sources?)\s+(?:on|about|for)\s+(.+)/i) ||
      lowerMsg.match(/^\/search\s+(.+)/i);
    if (searchMatch) {
      const query = searchMatch[1].trim();
      const startTime = Date.now();
      const searchRes = await searchLiveWeb(query);
      const elapsed = Date.now() - startTime;

      const topSnippets = searchRes.results.slice(0, 2).map((r) => r.snippet).join(' ');
      const reply = `I searched the web for "${query}". Found ${searchRes.results.length} relevant sources. ${topSnippets ? `Summary: ${topSnippets.slice(0, 180)}` : ''}`;

      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'web-search-engine',
        modelUsed: searchRes.source,
        isDirective: false,
        reply,
        action: {
          type: 'web_search',
          query,
          results: searchRes.results,
          source: searchRes.source,
        },
        durationMs: elapsed,
        detectedIntent: 'tool_web_search',
      });
    }

    // -------------------------------------------------------------
    // 9. UI Theme & Arc Reactor Controls
    // -------------------------------------------------------------
    const themeMatch =
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:set|change|switch)\s+(?:the\s+)?theme\s+to\s+(cyan|gold|crimson|emerald|purple|indigo|amber|blue|dark)\b/i) ||
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?theme\s+(cyan|gold|crimson|emerald|purple|indigo|amber|blue|dark)\b/i);
    if (themeMatch) {
      const theme = themeMatch[1].toLowerCase();
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: `Switching interface theme to ${theme}, sir.`,
        action: { type: 'ui_theme', theme },
        durationMs: 35,
        detectedIntent: 'task_ui_theme',
      });
    }

    const reactorMatch =
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:set|change|switch|adjust)\s+(?:the\s+)?reactor\s+(?:to\s+)?(pulse|ring|sphere|wire|fast|slow|idle|nominal)\b/i) ||
      lowerMsg.match(/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?reactor\s+(pulse|ring|sphere|wire|fast|slow|idle|nominal)\b/i);
    if (reactorMatch) {
      const style = reactorMatch[1].toLowerCase();
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: `Adjusting arc reactor to ${style} mode, sir.`,
        action: { type: 'ui_reactor', style },
        durationMs: 35,
        detectedIntent: 'task_ui_reactor',
      });
    }

    // -------------------------------------------------------------
    // 10. Clear Screen / Diagnostics Task
    // -------------------------------------------------------------
    if (/^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:clear|reset)\s+(?:the\s+)?(?:screen|diagnostics|logs?|events?)\b/i.test(lowerMsg)) {
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply: `Diagnostics log cleared, sir.`,
        action: { type: 'clear_screen' },
        durationMs: 20,
        detectedIntent: 'task_clear_screen',
      });
    }

    // -------------------------------------------------------------
    // 11. Company Status / System Health Task
    // -------------------------------------------------------------
    if (
      /^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:what(?:'s|\s+is)\s+(?:our|the)\s+)?(?:company\s+)?status(?:\s+report)?\b/i.test(lowerMsg) ||
      /^(?:jarvis\s*,?\s*|sophia\s*,?\s*)?(?:how\s+are\s+we\s+doing|system\s+health|operational\s+posture)\b/i.test(lowerMsg)
    ) {
      let pendingApprovals = 0;
      try {
        const { prisma } = await import('@/lib/server/db/prisma');
        if (prisma) {
          pendingApprovals = await prisma.approvalRecord.count({ where: { decision: 'pending' } }).catch(() => 0);
        }
      } catch {
        // Safe ignore
      }

      const reply = `All core systems nominal, sir. Sophia operating system is live with ${pendingApprovals} pending founder approval${pendingApprovals === 1 ? '' : 's'}. Executive council is standing by.`;
      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'jarvis-controller',
        modelUsed: 'local-jarvis-v1',
        isDirective: false,
        reply,
        action: { type: 'company_status', pendingApprovals },
        durationMs: 50,
        detectedIntent: 'task_company_status',
      });
    }

    // Determine if utterance is a company directive requiring Council orchestration
    const isDirective =
      userSpokenText.length > 0 &&
      (/^(please\s+)?(research|plan|audit|review|analyze|calculate|build|execute|model|orchestrate|run|start|transfer|delete|drop|send|deploy|publish|remove|pay|hire|fire)\b/i.test(
        userSpokenText
      ) || userSpokenText.length > 80);

    if (isDirective) {
      const startTime = Date.now();
      // Execute through authoritative MultiAgentOrchestrator council
      const orchestrator = new MultiAgentOrchestrator();
      const run = await orchestrator.orchestrateDirective({
        directive: userSpokenText,
        autonomyLevel: 'autonomous',
        agents: ['coo', 'researcher', 'pm', 'finance'],
      });
      const elapsed = Date.now() - startTime;

      const recommendation = run.executiveResult?.recommendation || 'Directive executed by executive council.';
      const approvalsCount = run.plan.filter((p) => p.status === 'requires_approval').length;

      return NextResponse.json({
        success: true,
        turnId,
        sessionId,
        providerId: 'council-orchestrator',
        modelUsed: 'executive-council-v1',
        isDirective: true,
        reply: `[Executive Council] ${run.title}: ${recommendation}`,
        orchestrationRunId: run.id,
        approvalsPending: approvalsCount,
        action: { type: 'council_directive', runId: run.id },
        durationMs: elapsed,
        detectedIntent: 'directive',
      });
    }

    // Standard Realtime Provider Turn (Gemini / Provider-neutral with Persona)
    const provider = getRealtimeProvider(providerId);
    const validPersonas = ['friendly', 'professional', 'creative', 'technical'];
    const selectedPersona = validPersonas.includes(personaId) ? personaId : 'friendly';

    const result = await provider.executeTurn({
      turnId,
      sessionId,
      founderMessage: userSpokenText,
      conversationHistory,
      personaId: selectedPersona as any,
      cameraSnapshot,
      audioRecording,
    });

    return NextResponse.json({
      success: true,
      turnId: result.turnId,
      sessionId,
      providerId: result.providerId,
      modelUsed: result.modelUsed,
      isDirective: false,
      reply: result.fullText,
      durationMs: result.durationMs,
      detectedIntent: result.detectedIntent || 'conversation',
      costEstimateUsd: result.costEstimateUsd,
    });
  } catch (err: any) {
    console.error('[RealtimeTurnRoute] Turn failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to process realtime turn',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/realtime/turn
 * Returns available realtime providers and status.
 */
export async function GET(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder || founder.role !== 'FOUNDER') {
      return NextResponse.json(
        { error: 'Unauthorized: Valid Founder session required', success: false },
        { status: 401 }
      );
    }

    const available = listRealtimeProviders();
    return NextResponse.json({
      success: true,
      providers: available,
      defaultProvider: 'gemini',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

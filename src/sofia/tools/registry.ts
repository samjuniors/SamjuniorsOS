/**
 * tools/registry.ts
 *
 * Central tool registry — the single router between the LLM and all capabilities.
 *
 * Architecture:
 *   Sofia Agent → ToolRegistry.invoke(call) → ITool.invoke(args)
 *                                           ↓
 *                               lifecycle events on controlLayer
 *                                           ↓
 *                                   React UI reacts
 *
 * Adding a new tool:
 *   1. Implement ITool in a new file under src/tools/
 *   2. register() it here
 *   3. Add its GeminiFunctionDeclaration to getFunctionDeclarations()
 *   4. No other files need to change.
 */

import { controlLayer } from '../sophia/control';
import type { ITool, ToolCall, ToolResult, ToolLifecyclePayload, GeminiFunctionDeclaration } from './types';
import { webSearchTool } from './web-search';
import { uiControlTool } from './ui-control';
import { systemControlTool } from './system-control';
import { ALL_SHAPES } from '../sophia/control';

// ─── Registry ─────────────────────────────────────────────────────────────────

class ToolRegistry {
  private readonly tools = new Map<string, ITool>();
  private readonly toolSchemas = new Map<string, GeminiFunctionDeclaration>();

  register(tool: ITool, schema?: GeminiFunctionDeclaration) {
    this.tools.set(tool.name, tool);
    if (schema) {
      this.toolSchemas.set(tool.name, schema);
    }
  }

  connectTool(_url: string, _config: Record<string, unknown>): Promise<void> {
    // This is a placeholder for the dynamic tool connection logic
    // In a real production app, this would perform a handshake with a remote tool server
    // and register the tool dynamically.
    return Promise.resolve();
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  // ─── Lifecycle event helpers ─────────────────────────────────────────────

  private emit(payload: ToolLifecyclePayload) {
    controlLayer.dispatchEvent(
      new CustomEvent<ToolLifecyclePayload>('tool:lifecycle', { detail: payload })
    );
  }

  // ─── Main invoke ──────────────────────────────────────────────────────────

  async invoke(call: ToolCall): Promise<Record<string, unknown>> {
    const tool = this.tools.get(call.name);

    if (!tool) {
      // Unknown tool — reject safely, do not execute.
      const payload: ToolLifecyclePayload = {
        type: 'TOOL_ERROR',
        tool: call.name,
        callId: call.id,
        error: `Tool "${call.name}" is not registered.`,
      };
      this.emit(payload);
      return { error: 'unregistered_tool', name: call.name };
    }

    // ── STARTED ─────────────────────────────────────────────────────────────
    this.emit({
      type: 'TOOL_STARTED',
      tool: call.name,
      callId: call.id,
      message: labelFor(call.name, call.args),
    });

    let result: ToolResult;
    try {
      result = await tool.invoke(call.args, call.id);
    } catch (err: any) {
      // Unexpected throw — surface as TOOL_ERROR
      result = {
        success: false,
        error: 'unexpected_error',
        errorDetail: err?.message ?? String(err),
      };
    }

    // ── RESULT or ERROR ──────────────────────────────────────────────────────
    if (result.success) {
      this.emit({ type: 'TOOL_RESULT', tool: call.name, callId: call.id, result });
    } else {
      this.emit({
        type: 'TOOL_ERROR',
        tool: call.name,
        callId: call.id,
        error: result.errorDetail ?? result.error ?? 'Unknown error',
        result,
      });
    }

    // Return a flat object for the Gemini tool_response / functionResponse payload.
    // The LLM receives this as context to formulate its spoken reply.
    if (result.success) {
      return flattenResult(call.name, result);
    }
    return {
      error: result.error ?? 'tool_failed',
      detail: result.errorDetail ?? 'The tool did not return a result.',
    };
  }

  cancel(name: string, callId: string) {
    const tool = this.tools.get(name);
    tool?.cancel?.(callId);
    this.emit({ type: 'TOOL_CANCELLED', tool: name, callId });
  }

  // ─── Gemini function declarations ─────────────────────────────────────────

  getFunctionDeclarations(): GeminiFunctionDeclaration[] {
    return [
      {
        name: 'web_search',
        description:
          'Search the web for current events, news, weather, stock prices, sports scores, ' +
          'factual lookups or any information that may be outdated in training data. ' +
          'Use only when external/real-time data is needed. Returns a spoken summary and source list.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Concise, keyword-focused search query (max 12 words).',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'system_control',
        description:
          'Control the physical device and native operating system. ' +
          'Open the user\'s real desktop browser (Chrome/Edge/Firefox) to any URL or video, ' +
          'perform searches in the desktop browser, stream music/video on YouTube or Spotify, ' +
          'launch native apps (notepad, calc, explorer, terminal), or query the real device clock/time. ' +
          'Always use this tool when the user asks to open something on their device or real browser.',
        parameters: {
          type: 'OBJECT',
          properties: {
            action: {
              type: 'STRING',
              enum: [
                'open_browser',
                'search_browser',
                'stream_media',
                'open_app',
                'get_time',
                'get_system_info',
              ] as unknown as string[],
              description: 'The native device action to perform.',
            },
            url: { type: 'STRING', description: 'URL to open in the native desktop browser.' },
            query: { type: 'STRING', description: 'Search query or music title for search_browser / stream_media.' },
            app: {
              type: 'STRING',
              enum: ['notepad', 'calc', 'calculator', 'explorer', 'files', 'cmd', 'terminal', 'chrome', 'edge', 'spotify'] as unknown as string[],
              description: 'Application name to launch on the operating system.',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'generate_image',
        description:
          'Generate a high-quality image, illustration, concept art, diagram, or photo. ' +
          'Call when the user asks to create, draw, paint, visualise or show something visual.',
        parameters: {
          type: 'OBJECT',
          properties: {
            prompt: { type: 'STRING', description: 'Detailed visual description for image generation.' },
            aspectRatio: {
              type: 'STRING',
              enum: ['1:1', '16:9', '9:16', '4:3', '3:4'] as unknown as string[],
              description: 'Aspect ratio (default 1:1).',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'transform_shape',
        description:
          "Transform Sofia's holographic physical form into a different geometry. " +
          'Call when the user asks to change shape, morph, or transform.',
        parameters: {
          type: 'OBJECT',
          properties: {
            shape: {
              type: 'STRING',
              enum: ALL_SHAPES as unknown as string[],
              description: "Target geometry for Sofia's form.",
            },
          },
          required: ['shape'],
        },
      },
      {
        name: 'ui_control',
        description:
          'Control the Sofia application interface. ' +
          'Open/close/toggle panels, display dynamic rich review cards (weather, time, reviews, documents, stories), ' +
          'scroll content up or down for the user, navigate the browser to a URL, play music on YouTube, stop music, ' +
          'show notifications, or control volume. ' +
          'IMPORTANT: never refuse a UI request — always call this tool.',
        parameters: {
          type: 'OBJECT',
          properties: {
            action: {
              type: 'STRING',
              enum: [
                'set_state',
                'open_panel', 'close_panel', 'toggle_panel', 'close_all_panels',
                'show_info_card', 'scroll_content', 'close_info_card',
                'navigate_to_url', 'play_music', 'stop_music',
                'show_notification', 'set_volume', 'update_status_text',
              ] as unknown as string[],
              description: 'The UI action to perform.',
            },
            state: {
              type: 'STRING',
              enum: ['idle', 'listening', 'thinking', 'speaking', 'paused', 'wakeup'] as unknown as string[],
              description: 'Target state for set_state action.',
            },
            panel: {
              type: 'STRING',
              enum: ['browser', 'chat', 'settings', 'diagnostics', 'terminal', 'info_card'] as unknown as string[],
              description: 'Target panel (required for open/close/toggle_panel).',
            },
            infoTitle: { type: 'STRING', description: 'Title of the dynamic info/review card.' },
            infoContent: { type: 'STRING', description: 'Rich content/body text of the dynamic info card to display and scroll.' },
            infoType: {
              type: 'STRING',
              enum: ['info', 'weather', 'time', 'review', 'story', 'document'] as unknown as string[],
              description: 'Visual category of the info panel.',
            },
            scrollDirection: {
              type: 'STRING',
              enum: ['up', 'down', 'top', 'bottom'] as unknown as string[],
              description: 'Direction to scroll the active dynamic card.',
            },
            url: { type: 'STRING', description: 'URL for navigate_to_url.' },
            query: { type: 'STRING', description: 'Music search query for play_music.' },
            message: { type: 'STRING', description: 'Notification text for show_notification.' },
            level: {
              type: 'STRING',
              enum: ['info', 'success', 'warning', 'error'] as unknown as string[],
              description: 'Notification severity (default: info).',
            },
            volume: { type: 'NUMBER', description: 'Volume level 0–100 for set_volume.' },
            text: { type: 'STRING', description: 'Status text for update_status_text.' },
            duration: { type: 'NUMBER', description: 'Duration in ms (notifications / status text).' },
          },
          required: ['action'],
        },
      },
    ];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function labelFor(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'web_search':     return `Searching for "${args.query}"…`;
    case 'system_control': return `Device: ${args.action}…`;
    case 'generate_image': return `Creating image: "${String(args.prompt ?? '').slice(0, 40)}"…`;
    case 'transform_shape': return `Transforming to ${args.shape}…`;
    case 'ui_control':     return `UI: ${args.action}…`;
    default:               return `Running ${name}…`;
  }
}

/** Flatten ToolResult.data into a top-level object the LLM can easily read. */
function flattenResult(name: string, result: ToolResult): Record<string, unknown> {
  if (name === 'web_search' && result.data) {
    const d = result.data as import('./types').WebSearchData;
    return {
      summary: d.summary,
      query: d.query,
      provider: d.provider,
      resultCount: d.results.length,
      results: d.results.slice(0, 5).map((r) => ({
        title: r.title,
        url: r.url,
        source: r.source,
        snippet: r.snippet,
      })),
      timestamp: d.timestamp,
    };
  }
  return typeof result.data === 'object' && result.data !== null
    ? (result.data as Record<string, unknown>)
    : { status: 'success' };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const toolRegistry = new ToolRegistry();

// Register all tools (order doesn't matter)
toolRegistry.register(webSearchTool);
toolRegistry.register(uiControlTool);
toolRegistry.register(systemControlTool);


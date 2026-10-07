/**
 * tools/types.ts
 *
 * Core contracts for Sofia's tool system.
 * All tools, results, lifecycle events and schemas live here.
 * The LLM never sees implementation — only Tool schemas.
 */

// ─── Tool identity ────────────────────────────────────────────────────────────

export type KnownToolName =
  | 'web_search'
  | 'ui_control'
  | 'system_control'
  | 'generate_image'
  | 'transform_shape'
  | 'play_music'
  | 'open_url';

// ─── Call & Result ────────────────────────────────────────────────────────────

export interface ToolCall {
  /** Opaque ID from the LLM or generated locally. */
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  /** Machine-readable error key, e.g. "no_results", "timeout", "not_configured". */
  error?: string;
  /** Human-readable description for logs only (never shown raw to the user). */
  errorDetail?: string;
}

// ─── Web search ───────────────────────────────────────────────────────────────

export interface SearchResultItem {
  title: string;
  url: string;
  /** Bare hostname, e.g. "bbc.co.uk" */
  source: string;
  snippet: string;
  /** ISO timestamp if provided by the search provider */
  publishedAt?: string;
}

export interface WebSearchData {
  query: string;
  results: SearchResultItem[];
  /** One-paragraph summary synthesised server-side for the LLM to speak. */
  summary: string;
  /** Provider that returned these results. */
  provider: 'tavily' | 'brave' | 'duckduckgo' | 'wikipedia' | 'gemini' | 'none';
  timestamp: string;
}

// ─── UI control ───────────────────────────────────────────────────────────────

export type PanelName = 'browser' | 'chat' | 'settings' | 'diagnostics' | 'terminal' | 'info_card';

export type UIActionType =
  | 'set_state'
  | 'open_panel'
  | 'close_panel'
  | 'toggle_panel'
  | 'close_all_panels'
  | 'navigate_to_url'
  | 'play_music'
  | 'stop_music'
  | 'show_info_card'
  | 'scroll_content'
  | 'close_info_card'
  | 'show_notification'
  | 'set_volume'
  | 'update_status_text';

export interface UIControlArgs {
  action: UIActionType;
  /** Sofia state target (for set_state: idle | listening | thinking | speaking | paused | wakeup) */
  state?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'wakeup';
  /** Panel target (open/close/toggle_panel) */
  panel?: PanelName;
  /** URL to open in the browser panel */
  url?: string;
  /** Music search query */
  query?: string;
  /** Dynamic info card title */
  infoTitle?: string;
  /** Dynamic info card content (markdown/text) */
  infoContent?: string;
  /** Dynamic info card type */
  infoType?: 'info' | 'weather' | 'time' | 'review' | 'story' | 'document';
  /** Scroll direction for dynamic content */
  scrollDirection?: 'up' | 'down' | 'top' | 'bottom';
  /** Notification message */
  message?: string;
  /** Notification level */
  level?: 'info' | 'success' | 'warning' | 'error';
  /** Volume 0–100 */
  volume?: number;
  /** Status text override */
  text?: string;
  /** Duration in ms (for show_notification / update_status_text) */
  duration?: number;
}

// ─── System Control (Device / Native OS) ──────────────────────────────────────

export interface SystemControlArgs {
  action: 'open_browser' | 'search_browser' | 'stream_media' | 'open_app' | 'get_time' | 'get_system_info';
  url?: string;
  query?: string;
  app?: string;
}

// ─── Lifecycle events ─────────────────────────────────────────────────────────

export type ToolLifecycleType =
  | 'TOOL_STARTED'
  | 'TOOL_PROGRESS'
  | 'TOOL_RESULT'
  | 'TOOL_ERROR'
  | 'TOOL_CANCELLED';

export interface ToolLifecyclePayload {
  type: ToolLifecycleType;
  /** Tool name, e.g. "web_search" */
  tool: string;
  /** Matches ToolCall.id when provided */
  callId?: string;
  /** Human-visible label for progress states, e.g. "Searching Tavily…" */
  message?: string;
  result?: ToolResult;
  error?: string;
}

// ─── Tool interface ───────────────────────────────────────────────────────────

export interface ITool {
  readonly name: string;
  readonly description: string;
  invoke(args: Record<string, unknown>, callId?: string): Promise<ToolResult>;
  /** Optional — cancel an in-flight call. */
  cancel?(callId: string): void;
}

// ─── Gemini function-declaration schema (Gemini Live / generateContent) ───────

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

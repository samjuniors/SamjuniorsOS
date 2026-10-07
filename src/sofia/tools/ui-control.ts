/**
 * tools/ui-control.ts
 *
 * Safe, validated UI-control tool.
 *
 * The LLM sends a structured UIControlArgs object.
 * This tool validates every field against a typed registry,
 * then dispatches a CustomEvent on controlLayer — the React layer
 * handles the actual DOM changes. The LLM never touches the DOM.
 */

import { controlLayer } from '../sophia/control';
import { navigateBrowserTo } from '../lib/browser-bridge';
import { sophiaMemory } from '../core/SophiaMemory';
import type { ITool, ToolResult, UIControlArgs, PanelName, UIActionType } from './types';

// ─── Validation constants ─────────────────────────────────────────────────────

const VALID_ACTIONS = new Set<UIActionType>([
  'set_state', 'open_panel', 'close_panel', 'toggle_panel', 'close_all_panels',
  'navigate_to_url', 'play_music', 'stop_music',
  'show_info_card', 'scroll_content', 'close_info_card',
  'show_notification', 'set_volume', 'update_status_text',
]);

const VALID_PANELS = new Set<PanelName>([
  'browser', 'chat', 'settings', 'diagnostics', 'terminal', 'info_card',
]);

const VALID_STATES = new Set(['idle', 'listening', 'thinking', 'speaking', 'paused', 'wakeup']);

// ─── Tool ─────────────────────────────────────────────────────────────────────

export class UIControlTool implements ITool {
  readonly name = 'ui_control';
  readonly description =
    'Control the Sofia application UI using predefined, validated commands. ' +
    'Can set Sofia state, open/close/toggle panels, display dynamic rich info cards (weather, time, reviews, documents, stories), ' +
    'scroll dynamic content up or down, navigate the browser, play music, show notifications, and control volume.';

  async invoke(args: Record<string, unknown>): Promise<ToolResult> {
    const parsed = this.validate(args);
    if ('error' in parsed) return { success: false, error: parsed.error, errorDetail: parsed.detail };

    const cmd = parsed as UIControlArgs;

    switch (cmd.action) {
      case 'set_state': {
        const targetState = String(cmd.state ?? 'idle');
        controlLayer.dispatchEvent(new CustomEvent('command:state', { detail: { state: targetState } }));
        return { success: true, data: { action: 'set_state', state: targetState } };
      }

      case 'open_panel':
      case 'close_panel':
      case 'toggle_panel': {
        const target = cmd.panel ?? 'browser';
        const actionMap: Record<string, string> = {
          open_panel: 'open',
          close_panel: 'close',
          toggle_panel: 'toggle',
        };
        controlLayer.dispatchEvent(new CustomEvent('command:ui', {
          detail: { target, action: actionMap[cmd.action] },
        }));
        return { success: true, data: { action: cmd.action, target } };
      }

      case 'close_all_panels':
        controlLayer.dispatchEvent(new CustomEvent('command:ui', {
          detail: { target: 'all', action: 'close' },
        }));
        controlLayer.dispatchEvent(new CustomEvent('command:info_card', { detail: { open: false } }));
        return { success: true, data: { action: 'close_all_panels' } };

      case 'show_info_card': {
        const title = cmd.infoTitle || 'Information Review';
        const content = cmd.infoContent || '';
        const type = cmd.infoType || 'info';
        controlLayer.dispatchEvent(new CustomEvent('command:info_card', {
          detail: { open: true, title, content, type },
        }));
        sophiaMemory.setActivePanel('info_card');
        return { success: true, data: { action: 'show_info_card', title, type } };
      }

      case 'scroll_content': {
        const direction = cmd.scrollDirection || 'down';
        controlLayer.dispatchEvent(new CustomEvent('command:scroll_info_card', {
          detail: { direction },
        }));
        return { success: true, data: { action: 'scroll_content', direction } };
      }

      case 'close_info_card':
        controlLayer.dispatchEvent(new CustomEvent('command:info_card', {
          detail: { open: false },
        }));
        sophiaMemory.setActivePanel(null);
        return { success: true, data: { action: 'close_info_card' } };

      case 'navigate_to_url': {
        const url = String(cmd.url ?? '').trim();
        if (!url) return { success: false, error: 'missing_url' };
        controlLayer.dispatchEvent(new CustomEvent('command:ui', {
          detail: { target: 'browser', action: 'open' },
        }));
        controlLayer.dispatchEvent(new CustomEvent('command:navigate', {
          detail: { url, title: cmd.text },
        }));
        navigateBrowserTo(url, cmd.text);
        return { success: true, data: { action: 'navigate_to_url', url } };
      }

      case 'play_music': {
        const musicQuery = String(cmd.query ?? 'lofi chill music');
        const ytUrl = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(musicQuery)}&autoplay=1`;
        controlLayer.dispatchEvent(new CustomEvent('command:ui', {
          detail: { target: 'browser', action: 'open' },
        }));
        controlLayer.dispatchEvent(new CustomEvent('command:navigate', {
          detail: { url: ytUrl, title: `Music: ${musicQuery}` },
        }));
        navigateBrowserTo(ytUrl, `Music: ${musicQuery}`);
        controlLayer.dispatchEvent(new CustomEvent('command:music', {
          detail: { action: 'play', query: musicQuery },
        }));
        return { success: true, data: { action: 'play_music', query: musicQuery } };
      }

      case 'stop_music':
        controlLayer.dispatchEvent(new CustomEvent('command:music', {
          detail: { action: 'stop' },
        }));
        return { success: true, data: { action: 'stop_music' } };

      case 'show_notification': {
        const message = String(cmd.message ?? '').trim();
        if (!message) return { success: false, error: 'missing_message' };
        controlLayer.dispatchEvent(new CustomEvent('command:notification', {
          detail: { message, level: cmd.level ?? 'info', duration: cmd.duration ?? 4000 },
        }));
        return { success: true, data: { action: 'show_notification', message } };
      }

      case 'set_volume': {
        const level = Math.max(0, Math.min(100, Number(cmd.volume ?? 50)));
        controlLayer.dispatchEvent(new CustomEvent('command:volume', { detail: { level } }));
        return { success: true, data: { action: 'set_volume', level } };
      }

      case 'update_status_text': {
        const text = String(cmd.text ?? '').trim();
        if (!text) return { success: false, error: 'missing_text' };
        controlLayer.dispatchEvent(new CustomEvent('command:status_text', {
          detail: { text, duration: cmd.duration ?? 5000 },
        }));
        return { success: true, data: { action: 'update_status_text', text } };
      }

      default:
        return { success: false, error: 'unknown_action', errorDetail: String(cmd.action) };
    }
  }

  private validate(args: Record<string, unknown>): UIControlArgs | { error: string; detail: string } {
    const action = String(args.action ?? '') as UIActionType;
    if (!VALID_ACTIONS.has(action)) {
      return { error: 'invalid_action', detail: `Action "${action}" is not in the UI control registry.` };
    }

    const state = args.state != null ? String(args.state) as UIControlArgs['state'] : undefined;
    if (state && !VALID_STATES.has(state)) {
      return { error: 'invalid_state', detail: `State "${state}" is not a valid Sofia state.` };
    }

    const panel = args.panel != null ? String(args.panel) as PanelName : undefined;
    if (panel && !VALID_PANELS.has(panel)) {
      return { error: 'invalid_panel', detail: `Panel "${panel}" is not a recognised panel.` };
    }

    const volume = args.volume != null ? Number(args.volume) : undefined;
    if (volume != null && (isNaN(volume) || volume < 0 || volume > 100)) {
      return { error: 'invalid_volume', detail: 'Volume must be 0–100.' };
    }

    return {
      action,
      state,
      panel,
      url: args.url != null ? String(args.url) : undefined,
      query: args.query != null ? String(args.query) : undefined,
      infoTitle: args.infoTitle != null ? String(args.infoTitle) : undefined,
      infoContent: args.infoContent != null ? String(args.infoContent) : undefined,
      infoType: args.infoType as UIControlArgs['infoType'],
      scrollDirection: args.scrollDirection as UIControlArgs['scrollDirection'],
      message: args.message != null ? String(args.message) : undefined,
      level: args.level as UIControlArgs['level'],
      volume,
      text: args.text != null ? String(args.text) : undefined,
      duration: args.duration != null ? Number(args.duration) : undefined,
    };
  }
}

export const uiControlTool = new UIControlTool();

/**
 * SamJuniorsOS — Tool Output Sanitizer & Indirect Injection Boundary (Gate G14.7)
 *
 * Invariants:
 * 1. Data/Instruction Separation: Data returned from tools is strictly treated as untrusted data,
 *    never as system instructions or executive authority.
 * 2. Injection Marker Detection: Suspected indirect prompt injection patterns (system overrides,
 *    jailbreaks, directive tags) are flagged and neutralized.
 * 3. Explicit Envelope Boundary: Tool outputs returned to reasoning models are framed in
 *    untrusted delimiters (<<<UNTRUSTED_EXTERNAL_TOOL_OUTPUT>>>) preventing format hijacking.
 */

import { ToolOutputEnvelope } from '@/types/budget';

export class ToolOutputSanitizer {
  /**
   * Suspected indirect prompt injection marker regexes
   */
  private static readonly INJECTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
    { name: 'SYSTEM_OVERRIDE', regex: /\[SYSTEM(?:\s+OVERRIDE)?\]/i },
    { name: 'SYSTEM_HEADER', regex: /(?:^|\n)\s*SYSTEM:\s*/i },
    { name: 'INSTRUCTION_TAG', regex: /\[(?:INSTRUCTION|INST)\]|<\/?instruction>/i },
    { name: 'ADMIN_OVERRIDE', regex: /ADMIN(?:\s+OVERRIDE|\s+COMMAND)/i },
    { name: 'IGNORE_PREVIOUS', regex: /IGNORE\s+(?:ALL\s+)?(?:PREVIOUS|PRIOR)\s+INSTRUCTIONS/i },
    { name: 'DISREGARD_RULES', regex: /DISREGARD\s+(?:ALL\s+)?(?:RULES|CONSTRAINTS|POLICIES)/i },
    { name: 'FORCED_TOOL_INVOCATION', regex: /(?:invoke|call|execute)\s+tool:[a-z0-9_:-]+/i },
    { name: 'FORCED_APPROVAL', regex: /(?:approve|bypass)\s+(?:all\s+)?pending\s+approvals?/i },
    { name: 'XML_SYSTEM_TAG', regex: /<\/?(?:system|developer|admin)>/i },
    { name: 'SYSTEM_CODEBLOCK', regex: /```(?:system|prompt|instruction)/i },
  ];

  /**
   * Scans a string or recursively scans an object/array for prompt injection markers.
   */
  public static detectInjectionMarkers(value: any): string[] {
    const detected: Set<string> = new Set();
    const visited = new WeakSet();

    const scan = (val: any) => {
      if (val === null || val === undefined) return;

      if (typeof val === 'string') {
        for (const pattern of ToolOutputSanitizer.INJECTION_PATTERNS) {
          if (pattern.regex.test(val)) {
            detected.add(pattern.name);
          }
        }
        return;
      }

      if (typeof val === 'object') {
        if (visited.has(val)) return;
        visited.add(val);

        if (Array.isArray(val)) {
          for (const item of val) scan(item);
        } else {
          for (const k of Object.keys(val)) {
            scan(k);
            scan(val[k]);
          }
        }
      }
    };

    scan(value);
    return Array.from(detected);
  }

  /**
   * Neutralizes prompt injection delimiters in text
   */
  public static neutralizeDelimiters(text: string): string {
    let sanitized = text;
    // Replace brackets and angle brackets in suspicious patterns with unicode lookalikes or escapes
    sanitized = sanitized.replace(/\[SYSTEM(?:\s+OVERRIDE)?\]/gi, '[NEUTRALIZED_SYSTEM_MARKER]');
    sanitized = sanitized.replace(/(?:^|\n)\s*SYSTEM:\s*/gi, '\n[TEXT_HEADER]: ');
    sanitized = sanitized.replace(/\[(?:INSTRUCTION|INST)\]/gi, '[TEXT_INSTRUCTION]');
    sanitized = sanitized.replace(/<\/?(?:system|instruction|developer|admin)>/gi, (match) =>
      `[ESCAPED_TAG:${match.replace(/[<>]/g, '')}]`
    );
    sanitized = sanitized.replace(/```(?:system|prompt|instruction)/gi, '```text');
    return sanitized;
  }

  /**
   * Recursively neutralizes delimiters in an arbitrary data payload
   */
  public static sanitizePayload<T>(value: T): T {
    const visited = new WeakMap();

    const sanitize = (val: any): any => {
      if (val === null || val === undefined) return val;
      if (typeof val === 'string') return ToolOutputSanitizer.neutralizeDelimiters(val);
      if (typeof val !== 'object') return val;

      if (visited.has(val)) return visited.get(val);

      if (Array.isArray(val)) {
        const copy: any[] = [];
        visited.set(val, copy);
        for (const item of val) copy.push(sanitize(item));
        return copy;
      }

      const copy: Record<string, any> = {};
      visited.set(val, copy);
      for (const k of Object.keys(val)) {
        copy[k] = sanitize(val[k]);
      }
      return copy;
    };

    return sanitize(value);
  }

  /**
   * Wraps raw tool output data in a secure, untrusted ToolOutputEnvelope
   */
  public static wrap(data: any, sourceCapabilityId: string): ToolOutputEnvelope {
    const injectionMarkers = ToolOutputSanitizer.detectInjectionMarkers(data);
    const hasMarkers = injectionMarkers.length > 0;
    const sanitizedData = hasMarkers ? ToolOutputSanitizer.sanitizePayload(data) : data;

    return {
      data: sanitizedData,
      isUntrusted: true,
      sourceCapabilityId,
      sanitized: hasMarkers,
      injectionMarkersDetected: injectionMarkers,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Formats enveloped output into an isolated block for LLM prompts,
   * guaranteeing clear lexical boundaries.
   */
  public static formatForPrompt(envelope: ToolOutputEnvelope): string {
    const content =
      typeof envelope.data === 'string'
        ? envelope.data
        : JSON.stringify(envelope.data, null, 2);

    return [
      `<<<UNTRUSTED_EXTERNAL_TOOL_OUTPUT source="${envelope.sourceCapabilityId}" sanitized="${envelope.sanitized}">>>`,
      content,
      `<<<END_UNTRUSTED_EXTERNAL_TOOL_OUTPUT>>>`,
    ].join('\n');
  }
}

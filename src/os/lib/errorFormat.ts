/**
 * Canonical Error Formatting & Copy Sanitization (Gate G8.5)
 *
 * Exit evidence required:
 * "Every error state states what happened and what to do; no raw errors shown."
 *
 * Anti-leaking guarantees:
 * 1. Strips stack traces, memory addresses, and file paths (e.g. C:\..., /src/...).
 * 2. Strips raw JS exception prefixes (TypeError:, ReferenceError:, SyntaxError:, Error:).
 * 3. Strips internal HTTP codes, network URLs, and [object Object] artifacts.
 * 4. Normalizes every error into two structured clauses:
 *    - whatHappened: Clear, truthful explanation of what went wrong.
 *    - whatToDo: Actionable guidance on how the user or founder can resolve or recover.
 */

export interface FormattedUserError {
  whatHappened: string;
  whatToDo: string;
}

const RAW_ERROR_PATTERNS = [
  /^\s*(?:Uncaught\s+)?(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error):/i,
  /at\s+(?:.+?)\s+\((?:.+?):\d+:\d+\)/,
  /at\s+(?:.+?):\d+:\d+/,
  /(?:[A-Za-z]:\\|\/)[^\s]+\.(?:ts|tsx|js|jsx|mjs|cjs):\d+/i,
  /\[object\s+Object\]/i,
  /https?:\/\/[^\s]+/i,
  /Cannot read propert(?:y|ies) of (?:null|undefined)/i,
  /is not a function/i,
  /is not defined/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /503 Service Unavailable/i,
  /500 Internal Server Error/i,
  /502 Bad Gateway/i,
  /404 Not Found/i,
  /401 Unauthorized/i,
  /403 Forbidden/i,
];

/** Returns true if text contains raw exception traces, URLs, file paths, or JS error strings */
export function isRawError(text: unknown): boolean {
  if (typeof text !== "string") return true;
  return RAW_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/** Sanitizes any raw error into plain, dignified "what happened" and "what to do" */
export function formatUserError(
  err: unknown,
  fallback?: { whatHappened?: string; whatToDo?: string }
): FormattedUserError {
  const defaultHappened = fallback?.whatHappened || "An unexpected operational issue occurred.";
  const defaultToDo = fallback?.whatToDo || "Retry the operation or refresh the workspace.";

  if (!err) {
    return { whatHappened: defaultHappened, whatToDo: defaultToDo };
  }

  // Extract raw string representation
  let raw = "";
  if (typeof err === "string") {
    raw = err;
  } else if (err instanceof Error) {
    raw = err.message || err.name;
  } else if (typeof err === "object" && err !== null) {
    const candidate = (err as Record<string, unknown>).error || (err as Record<string, unknown>).message;
    if (typeof candidate === "string") {
      raw = candidate;
    } else {
      raw = String(err);
    }
  } else {
    raw = String(err);
  }

  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // 1. Network connectivity / offline / reachability
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network_error") ||
    lower.includes("offline") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed")
  ) {
    return {
      whatHappened: fallback?.whatHappened && !isRawError(fallback.whatHappened)
        ? fallback.whatHappened
        : "Unable to reach the authoritative server.",
      whatToDo: fallback?.whatToDo || "Check your internet connection and select retry.",
    };
  }

  // 2. 503 / Persistence unavailable / fail-closed
  if (
    lower.includes("503") ||
    lower.includes("persistence is unavailable") ||
    lower.includes("database unavailable") ||
    lower.includes("fail-closed")
  ) {
    return {
      whatHappened: fallback?.whatHappened && !isRawError(fallback.whatHappened)
        ? fallback.whatHappened
        : "Authoritative server persistence is temporarily unavailable.",
      whatToDo: fallback?.whatToDo || "Company state is protected. Wait a moment and retry the connection.",
    };
  }

  // 3. Unauthorized / Session expired
  if (
    lower.includes("unauthorized") ||
    lower.includes("session required") ||
    lower.includes("401") ||
    lower.includes("forbidden") ||
    lower.includes("403")
  ) {
    return {
      whatHappened: fallback?.whatHappened && !isRawError(fallback.whatHappened)
        ? fallback.whatHappened
        : "Your authentication session is missing or expired.",
      whatToDo: fallback?.whatToDo || "Sign in again to restore access.",
    };
  }

  // 4. Timeout / aborted
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) {
    return {
      whatHappened: fallback?.whatHappened && !isRawError(fallback.whatHappened)
        ? fallback.whatHappened
        : "The request timed out waiting for a server response.",
      whatToDo: fallback?.whatToDo || "Verify server health and try again.",
    };
  }

  // 5. Microphone permission / Audio device
  if (lower.includes("permission denied") || lower.includes("notallowederror") || lower.includes("microphone") || lower.includes("mic blocked")) {
    return {
      whatHappened: fallback?.whatHappened && !isRawError(fallback.whatHappened)
        ? fallback.whatHappened
        : "Microphone access was denied or audio device is in use.",
      whatToDo: fallback?.whatToDo || "Allow microphone access in browser settings, or use the text chat panel below.",
    };
  }

  // 6. Consequential action / Voice approval refusal
  if (lower.includes("consequential actions cannot be approved by voice") || lower.includes("voice approval rejected")) {
    return {
      whatHappened: "Consequential actions cannot be approved by voice per company governance policy.",
      whatToDo: "Sign off securely using the Approvals panel on your desktop.",
    };
  }

  // 7. Check if raw contains stack traces, code errors (TypeError, etc.), URLs
  if (isRawError(trimmed)) {
    return {
      whatHappened: fallback?.whatHappened && !isRawError(fallback.whatHappened)
        ? fallback.whatHappened
        : "An unexpected system processing issue occurred.",
      whatToDo: fallback?.whatToDo || "Refresh the workspace or retry the action.",
    };
  }

  // 8. Clean custom message: ensure it ends with punctuation and has guidance
  let cleanHappened = trimmed.replace(/^(?:Error:\s*)/i, "").trim();
  if (!cleanHappened.endsWith(".") && !cleanHappened.endsWith("!") && !cleanHappened.endsWith("?")) {
    cleanHappened += ".";
  }

  return {
    whatHappened: fallback?.whatHappened || cleanHappened,
    whatToDo: fallback?.whatToDo || defaultToDo,
  };
}

import { describe, it, expect } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { formatUserError, isRawError } from "../../src/os/lib/errorFormat";
import { ErrorState, EmptyState } from "../../src/os/components/surfaces/StandardSurfaces";
import { ErrorBoundary } from "../../src/os/components/surfaces/ErrorBoundary";
import fs from "fs";
import path from "path";

describe("Gate G8.5: Copy, empty states and error messages pass", () => {
  describe("formatUserError & isRawError sanitization unit tests", () => {
    it("detects raw technical errors, stack traces, and URLs correctly", () => {
      expect(isRawError("TypeError: Cannot read properties of undefined (reading 'foo')")).toBe(true);
      expect(isRawError("Error: at Object.run (E:\\Projects\\app.ts:42:15)")).toBe(true);
      expect(isRawError("Failed to fetch http://localhost:3000/api/orchestrate")).toBe(true);
      expect(isRawError("503 Service Unavailable")).toBe(true);
      expect(isRawError("[object Object]")).toBe(true);
      expect(isRawError("All operations nominal.")).toBe(false);
      expect(isRawError("Check server connectivity and retry.")).toBe(false);
    });

    it("sanitizes raw TypeError into plain whatHappened and whatToDo without leaking code details", () => {
      const raw = "TypeError: Cannot read properties of undefined (reading 'token') at E:\\src\\os.ts:12";
      const formatted = formatUserError(raw);

      expect(formatted.whatHappened).not.toContain("TypeError");
      expect(formatted.whatHappened).not.toContain("token");
      expect(formatted.whatHappened).not.toContain("E:\\src");
      expect(formatted.whatToDo).toBeTruthy();
      expect(isRawError(formatted.whatHappened)).toBe(false);
      expect(isRawError(formatted.whatToDo)).toBe(false);
    });

    it("sanitizes network failures into actionable connectivity instructions", () => {
      const raw = "Failed to fetch (500 http://localhost:3000/api/attention)";
      const formatted = formatUserError(raw);

      expect(formatted.whatHappened).toContain("authoritative server");
      expect(formatted.whatHappened).not.toContain("http://");
      expect(formatted.whatToDo.toLowerCase()).toContain("connection");
    });

    it("sanitizes 503 fail-closed persistence errors honestly", () => {
      const raw = "503 Service Unavailable: Authoritative persistence is unavailable";
      const formatted = formatUserError(raw);

      expect(formatted.whatHappened.toLowerCase()).toContain("persistence is temporarily unavailable");
      expect(formatted.whatToDo.toLowerCase()).toContain("retry");
    });

    it("sanitizes unauthorized / session expired errors with sign-in guidance", () => {
      const raw = "401 Unauthorized: Session required";
      const formatted = formatUserError(raw);

      expect(formatted.whatHappened.toLowerCase()).toContain("session is missing or expired");
      expect(formatted.whatToDo.toLowerCase()).toContain("sign in");
    });

    it("sanitizes microphone permission refusals with browser settings guidance", () => {
      const raw = "NotAllowedError: Permission denied by system";
      const formatted = formatUserError(raw);

      expect(formatted.whatHappened.toLowerCase()).toContain("microphone access was denied");
      expect(formatted.whatToDo.toLowerCase()).toContain("browser settings");
    });

    it("sanitizes voice approval refusal with visual panel guidance", () => {
      const raw = "Voice approval rejected: Consequential actions cannot be approved by voice";
      const formatted = formatUserError(raw);

      expect(formatted.whatHappened).toContain("cannot be approved by voice");
      expect(formatted.whatToDo).toContain("Approvals panel");
    });
  });

  describe("StandardSurfaces: ErrorState and EmptyState rendering", () => {
    it("renders ErrorState with both whatHappened and whatToDo clearly", () => {
      const html = renderToString(
        React.createElement(ErrorState, {
          title: "Telemetry Stream Disrupted",
          message: "Failed to synchronize operational state.",
          action: "Check your network connection and select 'Retry Sync' to reconnect.",
          onRetry: () => {},
        })
      );

      expect(html).toContain("Telemetry Stream Disrupted");
      expect(html).toContain("Failed to synchronize operational state.");
      expect(html).toContain("Check your network connection and select &#x27;Retry Sync&#x27; to reconnect.");
      expect(html).toContain("Retry Sync");
    });

    it("sanitizes raw error strings passed to ErrorState message", () => {
      const rawError = "TypeError: Cannot read properties of null at /src/os/Desktop.tsx:99";
      const html = renderToString(
        React.createElement(ErrorState, {
          title: "System Error",
          message: rawError,
        })
      );

      expect(html).not.toContain("TypeError");
      expect(html).not.toContain("/src/os/Desktop.tsx");
      expect(html).toContain("An unexpected system processing issue occurred.");
      expect(html).toContain("Refresh the workspace or retry the action.");
    });

    it("renders EmptyState with icon, title, description, and optional action", () => {
      const html = renderToString(
        React.createElement(EmptyState, {
          title: "No pending approvals",
          description: "Zero consequential actions are waiting for sign-off.",
          actionLabel: "Refresh Queue",
          onAction: () => {},
        })
      );

      expect(html).toContain("No pending approvals");
      expect(html).toContain("Zero consequential actions are waiting for sign-off.");
      expect(html).toContain("Refresh Queue");
    });
  });

  describe("ErrorBoundary recovery component", () => {
    it("renders normal children when no error occurs", () => {
      const html = renderToString(
        React.createElement(ErrorBoundary, {}, React.createElement("div", { id: "child" }, "Normal content"))
      );
      expect(html).toContain("Normal content");
    });

    it("renders recovery instructions and actions on error without leaking stack", () => {
      const errorBoundary = new ErrorBoundary({ children: null });
      errorBoundary.state = {
        hasError: true,
        error: new Error("TypeError: crash at /src/runtime.ts:400"),
      };

      const element = errorBoundary.render() as React.ReactElement;
      const html = renderToString(element);

      expect(html).toContain("Workspace Interface Disrupted");
      expect(html).not.toContain("/src/runtime.ts");
      expect(html).toContain("Reload Workspace");
      expect(html).toContain("Attempt Recovery");
    });
  });

  describe("Codebase static AST and contract compliance", () => {
    const root = path.resolve(__dirname, "../../");

    it("verifies FlowDesktop.tsx rail lists pass both message and actionable guidance to ErrorState", () => {
      const content = fs.readFileSync(path.join(root, "src/os/components/FlowDesktop.tsx"), "utf8");

      // Attention list
      expect(content).toContain('title="Telemetry Stream Disrupted"');
      expect(content).toContain('action="Check your network connection and select \'Retry Sync\' to reconnect."');

      // Decision list
      expect(content).toContain('title="Governance Queue Inaccessible"');
      expect(content).toContain('action="Check server connectivity and select \'Retry Sync\' to review open decision briefs."');

      // Approval list
      expect(content).toContain('title="Authorization Gate Unreachable"');
      expect(content).toContain('action="Check network connectivity and select \'Retry Sync\' to verify pending approvals."');

      // Activity list
      expect(content).toContain('title="Audit Stream Unavailable"');
      expect(content).toContain('action="Select \'Retry Sync\' to reconnect and stream from the immutable audit ledger."');
    });

    it("verifies ChatPanel.tsx handles errors with formatUserError and provides clear empty state", () => {
      const content = fs.readFileSync(path.join(root, "src/os/components/os/ChatPanel.tsx"), "utf8");

      expect(content).toContain("formatUserError");
      expect(content).toContain("What to do:");
      expect(content).toContain("No messages yet with");
    });

    it("verifies Spotlight.tsx provides helpful guidance on empty search results", () => {
      const content = fs.readFileSync(path.join(root, "src/os/components/os/Spotlight.tsx"), "utf8");

      expect(content).toContain("No results found for");
      expect(content).toContain("Try a different keyword, or press ESC to dismiss.");
    });

    it("verifies SharedSophiaVoicePresence.tsx sanitizes errors and tells user what to do", () => {
      const content = fs.readFileSync(path.join(root, "src/os/components/voice/SharedSophiaVoicePresence.tsx"), "utf8");

      expect(content).toContain("formatUserError");
      expect(content).toContain("Allow microphone access in browser settings, or use the text chat panel below.");
    });
  });
});

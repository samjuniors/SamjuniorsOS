import React, { Component, type ReactNode, type ErrorInfo } from "react";
import { formatUserError } from "../../lib/errorFormat";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log privately for diagnostics; never render stack traces to the user
    console.error("[ErrorBoundary] Caught interface error:", error, errorInfo);
  }

  handleReload = (): void => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const formatted = formatUserError(this.state.error, {
        whatHappened: "A rendering disruption occurred in this interface section.",
        whatToDo: "Reload the workspace to restore the display. Server-authoritative state is safely preserved.",
      });

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="m-4 flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-[#0c0508]/95 p-6 text-center shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-400">
            <span className="text-lg" aria-hidden="true">⚠️</span>
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-rose-300">
            {this.props.fallbackTitle || "Workspace Interface Disrupted"}
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-rose-200/90 leading-relaxed">
            {formatted.whatHappened}
          </p>
          <p className="mt-1 max-w-md text-[11px] text-rose-300/80 font-medium">
            {formatted.whatToDo}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={this.handleReload}
              className="rounded-lg border border-rose-400/40 bg-rose-500/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-rose-200 transition-colors hover:bg-rose-500/30 active:scale-95 focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-1"
            >
              Reload Workspace
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/10 hover:text-white active:scale-95 focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-1"
            >
              Attempt Recovery
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;

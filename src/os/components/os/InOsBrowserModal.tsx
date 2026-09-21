import React, { useState, useEffect } from 'react';
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  ExternalLink,
  BookOpen,
  X,
  Minus,
  Maximize2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

interface InOsBrowserModalProps {
  initialUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

export const InOsBrowserModal: React.FC<InOsBrowserModalProps> = ({
  initialUrl,
  isOpen,
  onClose,
}) => {
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [history, setHistory] = useState<string[]>([initialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [useReaderView, setUseReaderView] = useState(false);
  const [readerContent, setReaderContent] = useState<{ title: string; html: string } | null>(null);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (initialUrl) {
      setCurrentUrl(initialUrl);
      setInputUrl(initialUrl);
      setHistory([initialUrl]);
      setHistoryIndex(0);
    }
  }, [initialUrl]);

  // Load reader view if active
  useEffect(() => {
    if (useReaderView && currentUrl) {
      setIsLoading(true);
      setReaderError(null);
      fetch(`/api/browser/read?url=${encodeURIComponent(currentUrl)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setReaderContent({ title: data.title, html: data.htmlSnippet });
          } else {
            setReaderError(data.error || 'Unable to extract reader view');
          }
        })
        .catch((err) => {
          setReaderError(err.message || 'Fetch failed');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [useReaderView, currentUrl]);

  if (!isOpen) return null;

  const navigateTo = (url: string) => {
    let target = url.trim();
    if (!target) return;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(target);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setCurrentUrl(target);
    setInputUrl(target);
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setCurrentUrl(prev);
      setInputUrl(prev);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setCurrentUrl(next);
      setInputUrl(next);
    }
  };

  const handleRefresh = () => {
    const temp = currentUrl;
    setCurrentUrl('');
    setTimeout(() => setCurrentUrl(temp), 50);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative flex flex-col rounded-2xl border border-cyan-500/30 bg-[#060914] shadow-[0_0_60px_rgba(0,0,0,0.85)] overflow-hidden transition-all duration-300 ${
          isMaximized ? 'h-full w-full rounded-none' : 'h-[85vh] w-full max-w-5xl'
        }`}
      >
        {/* Browser Chrome Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0b0e20] border-b border-white/10 select-none">
          {/* Window Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex h-3 w-3 items-center justify-center rounded-full bg-rose-500 hover:bg-rose-600 transition-colors"
              title="Close Browser"
            />
            <button
              onClick={() => setIsMaximized((prev) => !prev)}
              className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-600 transition-colors"
              title="Toggle Size"
            />
            <button
              onClick={() => setIsMaximized(false)}
              className="flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 transition-colors"
              title="Standard Size"
            />
            <span className="ml-2 flex items-center gap-1 text-[11px] font-mono text-cyan-300/80 font-medium">
              <Globe size={13} className="text-cyan-400" />
              <span>SamJuniorsOS In-OS Browser</span>
            </span>
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseReaderView((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-mono transition-all ${
                useReaderView
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-white/10'
              }`}
              title="Toggle Reader Mode (bypasses frame-blocking)"
            >
              <BookOpen size={11} />
              <span>{useReaderView ? 'Reader ON' : 'Reader View'}</span>
            </button>

            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              title="Open in new external tab"
            >
              <ExternalLink size={12} />
            </a>

            <button
              onClick={() => setIsMaximized((prev) => !prev)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              title="Maximize"
            >
              <Maximize2 size={12} />
            </button>

            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/60 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              title="Close"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Navigation & Address Bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#080b18] border-b border-white/5">
          <div className="flex items-center gap-1">
            <button
              onClick={handleBack}
              disabled={historyIndex <= 0}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:text-white disabled:opacity-30 disabled:hover:text-white/60 transition-colors"
              title="Back"
            >
              <ArrowLeft size={13} />
            </button>
            <button
              onClick={handleForward}
              disabled={historyIndex >= history.length - 1}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:text-white disabled:opacity-30 disabled:hover:text-white/60 transition-colors"
              title="Forward"
            >
              <ArrowRight size={13} />
            </button>
            <button
              onClick={handleRefresh}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:text-white transition-colors"
              title="Refresh"
            >
              <RotateCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Address Bar Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigateTo(inputUrl);
            }}
            className="flex-1 flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 focus-within:border-cyan-400 focus-within:shadow-[0_0_10px_rgba(6,182,212,0.25)] transition-all"
          >
            <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Search or enter web URL..."
              className="w-full bg-transparent text-xs text-white font-mono placeholder:text-white/30 focus:outline-none"
            />
            <button
              type="submit"
              className="text-[10px] font-mono text-cyan-400 hover:text-cyan-200 uppercase px-1.5 py-0.5"
            >
              GO
            </button>
          </form>
        </div>

        {/* Browser View Area */}
        <div className="relative flex-1 w-full bg-[#03060f] overflow-hidden">
          {useReaderView ? (
            /* Reader View Mode */
            <div className="h-full w-full overflow-y-auto p-6 sm:p-10 select-text max-w-3xl mx-auto custom-scrollbar">
              {isLoading ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-cyan-400">
                  <RotateCw size={24} className="animate-spin" />
                  <span className="text-xs font-mono">Extracting clean readable content...</span>
                </div>
              ) : readerError ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center p-8">
                  <AlertCircle size={32} className="text-amber-400" />
                  <h3 className="text-sm font-medium text-slate-200">Reader view extraction failed</h3>
                  <p className="text-xs text-slate-400">{readerError}</p>
                  <button
                    onClick={() => setUseReaderView(false)}
                    className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
                  >
                    Switch to Direct Web View
                  </button>
                </div>
              ) : readerContent ? (
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-slate-100 mb-4 pb-3 border-b border-white/10">
                    {readerContent.title}
                  </h1>
                  <div
                    className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed font-light"
                    dangerouslySetInnerHTML={{ __html: readerContent.html }}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            /* Direct Web View (Iframe) */
            <div className="relative h-full w-full">
              {currentUrl && (
                <iframe
                  key={currentUrl}
                  src={currentUrl}
                  className="h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  onLoad={() => setIsLoading(false)}
                  title="In-OS Browser Page"
                />
              )}
              {/* Notice helper overlay in bottom corner */}
              <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-white/10 bg-black/80 px-3 py-1.5 text-[10px] font-mono text-white/50 backdrop-blur-md">
                Site blocking iframe? Click &ldquo;Reader View&rdquo; above.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

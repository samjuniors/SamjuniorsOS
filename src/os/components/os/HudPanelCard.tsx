import React from 'react';
import { ExternalLink, Globe, Sparkles, X, Download, Maximize2 } from 'lucide-react';
import { SearchResultItem } from '@/lib/server/tools/web-search';

export interface HudCardData {
  id: string;
  type: 'web_search' | 'image_generator' | 'system_info';
  title: string;
  timestamp: string;
  searchData?: {
    query: string;
    source: string;
    results: SearchResultItem[];
  };
  imageData?: {
    prompt: string;
    imageUrl: string;
    width: number;
    height: number;
  };
}

interface HudPanelCardProps {
  card: HudCardData;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
}

export const HudPanelCard: React.FC<HudPanelCardProps> = ({ card, onClose, onOpenUrl }) => {
  return (
    <div className="relative w-full max-w-xl rounded-2xl border border-cyan-500/25 bg-[#050816]/90 p-4.5 shadow-[0_0_35px_rgba(6,182,212,0.15)] backdrop-blur-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          {card.type === 'web_search' ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              <Globe size={13} />
            </div>
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
              <Sparkles size={13} />
            </div>
          )}
          <div>
            <h4 className="text-xs font-mono font-medium uppercase tracking-wider text-slate-200">
              {card.title}
            </h4>
            <span className="text-[10px] font-mono text-white/40">{card.timestamp}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          title="Dismiss card"
        >
          <X size={13} />
        </button>
      </div>

      {/* Web Search Results Display */}
      {card.type === 'web_search' && card.searchData && (
        <div className="mt-3 space-y-2.5">
          <div className="text-[11px] font-mono text-cyan-300/80">
            Query: &ldquo;<span className="text-white font-medium">{card.searchData.query}</span>&rdquo;
          </div>
          <div className="max-h-56 overflow-y-auto pr-1 space-y-2 select-text custom-scrollbar">
            {card.searchData.results.map((item, idx) => (
              <div
                key={idx}
                className="group rounded-xl border border-white/5 bg-white/[0.02] p-2.5 transition-all duration-200 hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-slate-200 group-hover:text-cyan-200 line-clamp-1">
                    {item.title}
                  </span>
                  <button
                    onClick={() => onOpenUrl(item.url)}
                    className="flex shrink-0 items-center gap-1 text-[10px] font-mono text-cyan-400 hover:underline"
                    title="Open in OS Browser"
                  >
                    Open <ExternalLink size={10} />
                  </button>
                </div>
                <p className="mt-1 text-[11px] font-light leading-relaxed text-slate-400 line-clamp-2">
                  {item.snippet}
                </p>
                <span className="mt-1 inline-block text-[9px] font-mono text-white/30 truncate max-w-xs">
                  {item.source || item.url}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated Image Display */}
      {card.type === 'image_generator' && card.imageData && (
        <div className="mt-3">
          <p className="text-[11px] font-light italic text-purple-300/90 mb-2 select-text">
            &ldquo;{card.imageData.prompt}&rdquo;
          </p>
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/60 aspect-video flex items-center justify-center group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageData.imageUrl}
              alt={card.imageData.prompt}
              className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
              <span className="text-[10px] font-mono text-white/70">
                {card.imageData.width} &times; {card.imageData.height}
              </span>
              <div className="flex items-center gap-1.5">
                <a
                  href={card.imageData.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white hover:bg-white/30 backdrop-blur-md"
                  title="Open full size"
                >
                  <Maximize2 size={12} />
                </a>
                <a
                  href={card.imageData.imageUrl}
                  download={`sophia-${Date.now()}.png`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/80 text-white hover:bg-purple-500 backdrop-blur-md"
                  title="Download image"
                >
                  <Download size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

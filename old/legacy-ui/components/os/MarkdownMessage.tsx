'use client';

import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { Check, Copy, Terminal, ExternalLink } from 'lucide-react';
import { playOSSound } from './IconHelper';

interface MarkdownMessageProps {
  content: string;
  isFounder?: boolean;
  soundEnabled?: boolean;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({
  content,
  isFounder = false,
  soundEnabled = true,
}) => {
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const handleCopyCode = (code: string, id: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(code);
      setCopiedCodeId(id);
      if (soundEnabled) playOSSound('copy');
      setTimeout(() => setCopiedCodeId(null), 2000);
    }
  };

  return (
    <div className="markdown-body font-sans text-xs sm:text-[13px] leading-[1.65] break-words">
      <Markdown
        components={{
          p: ({ children }) => (
            <p className="my-1.5 first:mt-0 last:mb-0 leading-[1.65] text-slate-200">
              {children}
            </p>
          ),
          h1: ({ children }) => (
            <h1 className="text-sm sm:text-base font-bold text-white mt-3 mb-1.5 pb-1 border-b border-white/10 flex items-center gap-1.5">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs sm:text-sm font-bold text-white mt-2.5 mb-1 text-indigo-300 flex items-center gap-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-slate-100 mt-2 mb-1">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="my-1.5 pl-4 space-y-1 list-disc list-outside marker:text-indigo-400 text-slate-200">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 pl-4 space-y-1 list-decimal list-outside marker:text-indigo-400 marker:font-mono text-slate-200">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-[1.6] pl-0.5">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-indigo-500/70 bg-indigo-950/20 px-3 py-1.5 rounded-r-xl text-slate-300 italic text-[12px]">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }: any) => {
            const isInline = !className && typeof children === 'string' && !children.includes('\n');
            const codeString = String(children).replace(/\n$/, '');
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            if (isInline) {
              return (
                <code
                  className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-indigo-300 border border-white/10 font-medium"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const codeBlockId = `code-${Math.random().toString(36).slice(2, 7)}`;
            const isCopied = copiedCodeId === codeBlockId;

            return (
              <div className="my-2.5 rounded-xl bg-black/60 border border-white/12 overflow-hidden shadow-md group">
                <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/10 text-[10px] font-mono text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <Terminal className="w-3 h-3 text-indigo-400" />
                    <span className="uppercase tracking-wider font-semibold text-slate-300">
                      {language || 'code'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(codeString, codeBlockId)}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-all active:scale-95"
                    title="Copy code snippet"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px] text-emerald-400 font-mono">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-200" />
                        <span className="text-[10px] font-mono">Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3 overflow-x-auto text-[11px] font-mono text-slate-200 leading-relaxed custom-scrollbar selection:bg-indigo-500/30">
                  <pre className="m-0 whitespace-pre">
                    <code>{codeString}</code>
                  </pre>
                </div>
              </div>
            );
          },
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-[11px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/5 text-slate-300 font-semibold">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-white/5">{children}</tbody>
          ),
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-slate-400">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="px-3 py-1.5 text-slate-300">{children}</td>,
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 inline-flex items-center gap-0.5 font-medium"
            >
              <span>{children}</span>
              <ExternalLink className="w-2.5 h-2.5 inline opacity-70" />
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
};

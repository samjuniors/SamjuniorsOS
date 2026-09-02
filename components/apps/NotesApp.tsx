'use client';

import React, { useState } from 'react';
import { FileEdit, Sparkles, Send, Copy, Check } from 'lucide-react';
import { playOSSound } from '../os/IconHelper';

interface NotesAppProps {
  onDispatchToWorkforce?: (note: string) => void;
  soundEnabled?: boolean;
}

export const NotesApp: React.FC<NotesAppProps> = ({ onDispatchToWorkforce, soundEnabled }) => {
  const [noteContent, setNoteContent] = useState(
    `# Founder Strategic Scratchpad\n\n- Need Sophia to review the Q4 autonomy SLA\n- Ask Dr. Thorne to benchmark latency on reasoning models\n- Check Julian's unit economics model for enterprise contracts`
  );
  const [copied, setCopied] = useState(false);

  const handleDispatch = () => {
    if (!noteContent.trim()) return;
    if (soundEnabled) playOSSound('execute');
    if (onDispatchToWorkforce) onDispatchToWorkforce(noteContent);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(noteContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <FileEdit className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white">Founder Executive Scratchpad</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-slate-300 transition-colors flex items-center gap-1"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            id="notes-dispatch-btn"
            onClick={handleDispatch}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-xs font-bold text-white shadow-md transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dispatch to AI Council</span>
          </button>
        </div>
      </div>

      <textarea
        id="notes-textarea"
        value={noteContent}
        onChange={(e) => setNoteContent(e.target.value)}
        placeholder="Type strategic notes, thoughts, or directives..."
        className="flex-1 w-full p-3 rounded-xl bg-black/50 border border-white/10 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono resize-none leading-relaxed"
      />
    </div>
  );
};

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TermIcon, CornerDownLeft, Sparkles } from 'lucide-react';
import { INITIAL_AGENTS, INITIAL_FINANCIALS } from '@/lib/os-data';
import { playOSSound } from '../os/IconHelper';

interface TerminalAppProps {
  onDispatchDirective?: (dir: string) => void;
  soundEnabled?: boolean;
}

export const TerminalApp: React.FC<TerminalAppProps> = ({ onDispatchDirective, soundEnabled }) => {
  const [history, setHistory] = useState<Array<{ text: string; type: 'input' | 'output' | 'error' | 'success' }>>([
    { text: 'SamJuniors OS v2.4.0 (x86_64-sj-kernel)', type: 'output' },
    { text: 'Type "help" to list autonomous AI CLI commands.', type: 'output' },
  ]);
  const [inputVal, setInputVal] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const raw = inputVal.trim();
    const [cmd, ...args] = raw.split(' ');
    const lowerCmd = cmd.toLowerCase();

    const newHistory = [...history, { text: `founder@samjuniors:~$ ${raw}`, type: 'input' as const }];

    if (soundEnabled) playOSSound('click');

    switch (lowerCmd) {
      case 'help':
        newHistory.push({
          text: `Available SamJuniors OS commands:
  agents          List all 4 autonomous AI executives and their uptime
  status          Kernel telemetry and compute health
  pnl             Display real-time income statement & margin
  dispatch <text> Dispatch strategic directive directly to AI swarm
  clear           Clear terminal history
  version         Show OS version & kernel build`,
          type: 'output',
        });
        break;

      case 'agents':
        newHistory.push({
          text: INITIAL_AGENTS.map(
            (a) => `• [${a.id.toUpperCase()}] ${a.name} (${a.role}) -> Uptime: ${a.uptime} | Tasks: ${a.tasksCompleted}`
          ).join('\n'),
          type: 'success',
        });
        break;

      case 'status':
        newHistory.push({
          text: `[SYSTEM OK] Swarm Health: 100% | Latency: 0.4ms | Active Subscriptions: 18 | Margin: 86.4%`,
          type: 'success',
        });
        break;

      case 'pnl':
        newHistory.push({
          text: `MRR: $${INITIAL_FINANCIALS.mrr.toLocaleString()} | ARR: $${(INITIAL_FINANCIALS.mrr * 12).toLocaleString()} | Gross Margin: ${INITIAL_FINANCIALS.grossMargin}% | Runway: ${INITIAL_FINANCIALS.runwayMonths}mo`,
          type: 'output',
        });
        break;

      case 'dispatch':
        const dir = args.join(' ');
        if (!dir) {
          newHistory.push({ text: 'Error: Please provide a directive (e.g. "dispatch evaluate enterprise tier")', type: 'error' });
        } else {
          newHistory.push({ text: `[SWARM TRIGGERED] Dispatching: "${dir}"...`, type: 'success' });
          if (onDispatchDirective) onDispatchDirective(dir);
        }
        break;

      case 'clear':
        setHistory([]);
        setInputVal('');
        return;

      case 'version':
        newHistory.push({
          text: `SamJuniors OS 2.4.0 (Enterprise AI Swarm Edition)
Kernel: sj-orchestrator-6.11
Model Backend: Google Gemini 3.7 Flash`,
          type: 'output',
        });
        break;

      default:
        newHistory.push({
          text: `Command not recognized: "${raw}". Type "help" for a list of available commands.`,
          type: 'error',
        });
    }

    setHistory(newHistory);
    setInputVal('');
  };

  return (
    <div className="h-full flex flex-col bg-black font-mono text-xs text-emerald-400 p-4 select-text">
      <div className="flex-1 overflow-y-auto space-y-2">
        {history.map((item, idx) => (
          <div
            key={idx}
            className={`whitespace-pre-wrap leading-relaxed ${
              item.type === 'input'
                ? 'text-slate-300 font-bold'
                : item.type === 'error'
                ? 'text-rose-400'
                : item.type === 'success'
                ? 'text-emerald-300'
                : 'text-slate-300'
            }`}
          >
            {item.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleCommand} className="mt-3 flex items-center space-x-2 pt-2 border-t border-white/10">
        <span className="text-indigo-400 font-bold">founder@samjuniors:~$</span>
        <input
          id="terminal-input"
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="type a command (e.g. 'help', 'agents')..."
          className="flex-1 bg-transparent border-none text-emerald-400 focus:outline-none placeholder:text-slate-700"
          autoFocus
        />
        <CornerDownLeft className="w-3.5 h-3.5 text-slate-600" />
      </form>
    </div>
  );
};

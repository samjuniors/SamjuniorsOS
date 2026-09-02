'use client';

import React from 'react';
import { motion } from 'motion/react';
import {
  Wifi,
  Bluetooth,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Shield,
  Activity,
  Zap,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { playOSSound } from './IconHelper';

interface ControlCenterProps {
  isOpen: boolean;
  onClose: () => void;
  autonomyMode: string;
  onSetAutonomyMode: (m: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenSettings: () => void;
}

export const ControlCenter: React.FC<ControlCenterProps> = ({
  isOpen,
  onClose,
  autonomyMode,
  onSetAutonomyMode,
  soundEnabled,
  onToggleSound,
  onOpenSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute top-9 right-3 w-80 os-glass rounded-2xl p-4 border border-white/20 shadow-2xl space-y-3.5 text-xs text-slate-100"
      >
        {/* Top 2x2 grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* WiFi & BT block */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <div className="flex items-center space-x-2 text-indigo-400 font-semibold">
              <Wifi className="w-4 h-4" />
              <span>SamJuniors Mesh</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-400 font-medium">
              <Bluetooth className="w-4 h-4" />
              <span>Neural Bus Active</span>
            </div>
          </div>

          {/* Autonomy Mode block */}
          <button
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              const next =
                autonomyMode === 'Fully Autonomous'
                  ? 'Human Co-Pilot'
                  : autonomyMode === 'Human Co-Pilot'
                  ? 'Advisory Only'
                  : 'Fully Autonomous';
              onSetAutonomyMode(next);
            }}
            className="p-3 rounded-xl bg-black/40 border border-white/10 text-left flex flex-col justify-between hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center justify-between text-emerald-400 font-bold">
              <Shield className="w-4 h-4" />
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Autonomy Guard</div>
              <div className="font-bold text-white text-[11px] truncate">{autonomyMode}</div>
            </div>
          </button>
        </div>

        {/* Audio Toggle */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5">
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
              Sound Effects
            </span>
            <button
              onClick={onToggleSound}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                soundEnabled ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-400'
              }`}
            >
              {soundEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className={`h-full bg-indigo-500 ${soundEnabled ? 'w-3/4' : 'w-0'}`} />
          </div>
        </div>

        {/* System Telemetry */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>Swarm Load: 14%</span>
            <span>Kernel Mem: 2.1 GB</span>
            <span className="text-emerald-400">0.4ms</span>
          </div>
          <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-emerald-400 w-[14%]" />
          </div>
        </div>

        {/* Footer Button */}
        <button
          onClick={() => {
            onOpenSettings();
            onClose();
          }}
          className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Open Full OS Settings</span>
        </button>
      </motion.div>
    </div>
  );
};

'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AppId, WindowState } from '@/types/os';
import { playOSSound } from './IconHelper';
import {
  Maximize2,
  Minimize2,
  Minus,
  X,
  Bot,
  Building2,
  Users,
  Compass,
  Boxes,
  TrendingUp,
  Sliders,
  Terminal,
  FileEdit,
  ChevronLeft,
  MessageSquare,
  Sparkles,
  Shield,
  Activity,
  Layers,
} from 'lucide-react';

interface OSWindowProps {
  window: WindowState;
  onClose: (id: AppId) => void;
  onMinimize: (id: AppId) => void;
  onMaximize: (id: AppId) => void;
  onFocus: (id: AppId) => void;
  soundEnabled: boolean;
  children: React.ReactNode;
}

function WindowHeaderIcon({ id }: { id: AppId }) {
  switch (id) {
    case 'workforce':
      return <Bot className="w-4 h-4 text-indigo-400" />;
    case 'company':
      return <Building2 className="w-4 h-4 text-blue-400" />;
    case 'customers':
      return <Users className="w-4 h-4 text-emerald-400" />;
    case 'research':
      return <Compass className="w-4 h-4 text-cyan-400" />;
    case 'products':
      return <Boxes className="w-4 h-4 text-purple-400" />;
    case 'finance':
      return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    case 'settings':
      return <Sliders className="w-4 h-4 text-amber-400" />;
    case 'terminal':
      return <Terminal className="w-4 h-4 text-emerald-400" />;
    case 'notes':
      return <FileEdit className="w-4 h-4 text-amber-300" />;
    case 'messages':
      return <MessageSquare className="w-4 h-4 text-sky-400" />;
    case 'advisor':
      return <Sparkles className="w-4 h-4 text-violet-400" />;
    default:
      return <Bot className="w-4 h-4 text-indigo-400" />;
  }
}

function WindowHeaderBadge({ id }: { id: AppId }) {
  switch (id) {
    case 'workforce':
      return (
        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 text-[10px] font-mono hidden sm:inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Council Mesh
        </span>
      );
    case 'company':
      return (
        <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/25 text-[10px] font-mono hidden sm:inline-flex items-center gap-1">
          <Shield className="w-2.5 h-2.5 text-blue-400" />
          Governance Invariants
        </span>
      );
    case 'customers':
      return (
        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 text-[10px] font-mono hidden sm:inline-flex items-center gap-1">
          <Users className="w-2.5 h-2.5 text-emerald-400" />
          CRM Pipeline Sync
        </span>
      );
    case 'research':
      return (
        <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 text-[10px] font-mono hidden sm:inline-flex items-center gap-1">
          <Compass className="w-2.5 h-2.5 text-cyan-400" />
          Epistemic Radar
        </span>
      );
    case 'products':
      return (
        <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/25 text-[10px] font-mono hidden sm:inline-flex items-center gap-1">
          <Boxes className="w-2.5 h-2.5 text-purple-400" />
          PRD Engine
        </span>
      );
    case 'finance':
      return (
        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 text-[10px] font-mono hidden sm:inline-flex items-center gap-1">
          <Activity className="w-2.5 h-2.5 text-emerald-400" />
          85% Margin Lock
        </span>
      );
    case 'settings':
      return (
        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/25 text-[10px] font-mono hidden sm:inline-flex items-center gap-1">
          <Sliders className="w-2.5 h-2.5 text-amber-400" />
          OS Telemetry
        </span>
      );
    default:
      return null;
  }
}

export const OSWindow: React.FC<OSWindowProps> = ({
  window: win,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  soundEnabled,
  children,
}) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState({ x: win.position.x, y: win.position.y });
  const [customSize, setCustomSize] = useState<{ width: number; height: number }>({
    width: win.size.width,
    height: win.size.height,
  });

  const dragStartRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const resizeStartRef = useRef({ startX: 0, startY: 0, initialW: 0, initialH: 0 });

  // Responsive mobile screen check
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleMouseDown = () => {
    onFocus(win.id);
  };

  const handleTitleBarMouseDown = (e: React.MouseEvent) => {
    if (win.isMaximized || isMobile) return;
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartRef.current.startX;
      const deltaY = moveEvent.clientY - dragStartRef.current.startY;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - 300, dragStartRef.current.initialX + deltaX)),
        y: Math.max(36, Math.min(window.innerHeight - 100, dragStartRef.current.initialY + deltaY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (win.isMaximized || isMobile) return;
    setIsResizing(true);
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialW: customSize.width,
      initialH: customSize.height,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - resizeStartRef.current.startX;
      const deltaY = moveEvent.clientY - resizeStartRef.current.startY;
      setCustomSize({
        width: Math.max(520, Math.min(window.innerWidth - pos.x - 10, resizeStartRef.current.initialW + deltaX)),
        height: Math.max(400, Math.min(window.innerHeight - pos.y - 10, resizeStartRef.current.initialH + deltaY)),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  if (!win.isOpen || win.isMinimized) return null;

  // Responsive bounds calculation
  const calculatedWidth = isMobile
    ? '100vw'
    : win.isMaximized
    ? '100vw'
    : Math.min(customSize.width, typeof window !== 'undefined' ? window.innerWidth - 30 : 920);

  const calculatedHeight = isMobile
    ? 'calc(100vh - 32px)'
    : win.isMaximized
    ? 'calc(100vh - 32px)'
    : Math.min(customSize.height, typeof window !== 'undefined' ? window.innerHeight - 70 : 620);

  const calculatedTop = isMobile || win.isMaximized ? 32 : pos.y;
  const calculatedLeft = isMobile || win.isMaximized ? 0 : pos.x;

  return (
    <motion.div
      ref={windowRef}
      id={`window-${win.id}`}
      onMouseDown={handleMouseDown}
      initial={
        isMobile
          ? { y: '100%', opacity: 0 }
          : { scale: 0.93, opacity: 0, y: 22 }
      }
      animate={{
        scale: 1,
        opacity: 1,
        y: 0,
        width: calculatedWidth,
        height: calculatedHeight,
        top: calculatedTop,
        left: calculatedLeft,
      }}
      exit={
        isMobile
          ? { y: '100%', opacity: 0 }
          : { scale: 0.92, opacity: 0, y: 20 }
      }
      transition={{
        type: 'spring',
        damping: 28,
        stiffness: 340,
        mass: 0.8,
      }}
      style={{ zIndex: win.zIndex }}
      className={`fixed bg-[#0c0d15]/95 backdrop-blur-3xl shadow-[0_35px_90px_rgba(0,0,0,0.8),0_0_1px_rgba(255,255,255,0.2)] flex flex-col border border-white/10 overflow-hidden group/window ${
        isMobile
          ? 'rounded-t-2xl border-x-0 border-b-0 bottom-0'
          : win.isMaximized
          ? 'rounded-none border-none'
          : 'rounded-2xl ring-1 ring-white/5'
      }`}
    >
      {/* Top subtle inner glow line */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

      {/* Window Titlebar */}
      <div
        onMouseDown={handleTitleBarMouseDown}
        onDoubleClick={() => {
          if (!isMobile) {
            if (soundEnabled) playOSSound('click');
            onMaximize(win.id);
          }
        }}
        className={`h-11 px-3 sm:px-4 flex items-center justify-between select-none ${
          isMobile ? 'cursor-default' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
        } border-b border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent hover:bg-white/[0.04] transition-colors`}
      >
        {/* Left Controls: Mobile Back / Desktop Traffic Lights */}
        {isMobile ? (
          <div className="flex items-center space-x-1.5">
            <button
              id={`mobile-window-back-${win.id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (soundEnabled) playOSSound('click');
                onClose(win.id);
              }}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/5 active:bg-white/10 text-slate-200 text-xs font-medium"
            >
              <ChevronLeft className="w-4 h-4 text-indigo-400" />
              <span>Back</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            {/* Close Button */}
            <button
              id={`window-close-${win.id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (soundEnabled) playOSSound('click');
                onClose(win.id);
              }}
              title="Close (⌘W)"
              className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-black/0 hover:text-black transition-all shadow-sm group"
            >
              <X className="w-2 h-2 opacity-0 group-hover:opacity-100 font-bold" />
            </button>

            {/* Minimize Button */}
            <button
              id={`window-minimize-${win.id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (soundEnabled) playOSSound('click');
                onMinimize(win.id);
              }}
              title="Minimize (⌘M)"
              className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 flex items-center justify-center text-black/0 hover:text-black transition-all shadow-sm group"
            >
              <Minus className="w-2 h-2 opacity-0 group-hover:opacity-100 font-bold" />
            </button>

            {/* Maximize/Restore Button */}
            <button
              id={`window-maximize-${win.id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (soundEnabled) playOSSound('click');
                onMaximize(win.id);
              }}
              title={win.isMaximized ? 'Restore Window' : 'Maximize Window'}
              className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-500 flex items-center justify-center text-black/0 hover:text-black transition-all shadow-sm group"
            >
              {win.isMaximized ? (
                <Minimize2 className="w-2 h-2 opacity-0 group-hover:opacity-100 font-bold" />
              ) : (
                <Maximize2 className="w-2 h-2 opacity-0 group-hover:opacity-100 font-bold" />
              )}
            </button>
          </div>
        )}

        {/* Window Title & Icon */}
        <div className="flex items-center space-x-2 text-[11px] font-semibold tracking-wider text-slate-200 uppercase pointer-events-none truncate max-w-[200px] sm:max-w-md">
          <WindowHeaderIcon id={win.id} />
          <span className="truncate">{win.title}</span>
        </div>

        {/* Right side contextual status badge & buttons */}
        <div className="flex items-center space-x-2">
          <WindowHeaderBadge id={win.id} />

          {isMobile ? (
            <button
              onClick={() => {
                if (soundEnabled) playOSSound('click');
                onClose(win.id);
              }}
              className="p-1.5 rounded-lg bg-white/5 active:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                if (soundEnabled) playOSSound('click');
                onMaximize(win.id);
              }}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
              title={win.isMaximized ? 'Restore' : 'Expand'}
            >
              {win.isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Window Body Container */}
      <div className="flex-1 overflow-auto bg-[#090a10]/95 text-slate-200 relative custom-scrollbar">
        {children}
      </div>

      {/* Bottom-right Resize Handle */}
      {!win.isMaximized && !isMobile && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 group/resize z-20"
          title="Drag to resize"
        >
          <svg
            className="w-2.5 h-2.5 text-slate-600 group-hover/resize:text-indigo-400 transition-colors"
            viewBox="0 0 6 6"
            fill="currentColor"
          >
            <circle cx="5" cy="5" r="0.8" />
            <circle cx="5" cy="3" r="0.8" />
            <circle cx="3" cy="5" r="0.8" />
          </svg>
        </div>
      )}
    </motion.div>
  );
};


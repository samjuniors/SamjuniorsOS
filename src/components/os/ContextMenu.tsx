'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LucideIcon } from 'lucide-react';
import { playOSSound } from './IconHelper';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  badge?: string;
  disabled?: boolean;
  destructive?: boolean;
  isHeader?: boolean;
  isSeparator?: boolean;
  onClick?: () => void;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  soundEnabled?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  state,
  onClose,
  soundEnabled = true,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number }>({ x: state.x, y: state.y });

  // Viewport collision detection & boundary containment
  useEffect(() => {
    if (!state.isOpen) return;

    if (soundEnabled) {
      playOSSound('menu');
    }

    const calculatePosition = () => {
      const menuWidth = 230;
      const menuHeight = Math.min(state.items.length * 36 + 40, 420);
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let nextX = state.x;
      let nextY = state.y;

      // Adjust horizontal overflow
      if (nextX + menuWidth > viewportWidth - 12) {
        nextX = Math.max(12, viewportWidth - menuWidth - 12);
      }

      // Adjust vertical overflow
      if (nextY + menuHeight > viewportHeight - 12) {
        nextY = Math.max(12, viewportHeight - menuHeight - 12);
      }

      setAdjustedPos({ x: nextX, y: nextY });
    };

    calculatePosition();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', calculatePosition);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', calculatePosition);
    };
  }, [state.isOpen, state.x, state.y, state.items, onClose, soundEnabled]);

  return (
    <AnimatePresence>
      {state.isOpen && (
        <div className="fixed inset-0 z-[9999] pointer-events-auto">
          {/* Transparent click shield */}
          <div
            className="absolute inset-0 bg-transparent"
            onContextMenu={(e) => {
              e.preventDefault();
              onClose();
            }}
            onClick={onClose}
          />

          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.94, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 2 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              left: `${adjustedPos.x}px`,
              top: `${adjustedPos.y}px`,
            }}
            className="w-56 bg-[#0f1118]/95 backdrop-blur-2xl border border-white/12 shadow-[0_20px_50px_rgba(0,0,0,0.85)] rounded-2xl p-1.5 text-xs text-slate-200 select-none z-[10000] ring-1 ring-black/60 focus:outline-none"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {state.title && (
              <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold border-b border-white/5 mb-1 flex items-center justify-between">
                <span>{state.title}</span>
                <span className="text-[9px] text-indigo-400">Context</span>
              </div>
            )}

            <div className="space-y-0.5">
              {state.items.map((item) => {
                if (item.isSeparator) {
                  return <div key={item.id} className="h-px bg-white/10 my-1 mx-1" />;
                }

                if (item.isHeader) {
                  return (
                    <div
                      key={item.id}
                      className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold"
                    >
                      {item.label}
                    </div>
                  );
                }

                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    id={`context-item-${item.id}`}
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      if (soundEnabled) playOSSound('pop');
                      item.onClick?.();
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-all group ${
                      item.disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : item.destructive
                        ? 'hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 active:scale-[0.98]'
                        : 'hover:bg-indigo-600/30 text-slate-200 hover:text-white active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      {Icon && (
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                            item.destructive
                              ? 'text-rose-400'
                              : 'text-slate-400 group-hover:text-indigo-300'
                          }`}
                        />
                      )}
                      <span className="truncate font-medium">{item.label}</span>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                      {item.badge && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                          {item.badge}
                        </span>
                      )}
                      {item.shortcut && (
                        <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-300">
                          {item.shortcut}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { APPS_CONFIG } from '@/lib/os-data';
import { AppId, WindowState } from '@/types/os';
import { getAppIcon, playOSSound } from './IconHelper';
import { Grid, Search } from 'lucide-react';

interface DockProps {
  windows: WindowState[] | Record<AppId, WindowState>;
  onAppClick: (id: AppId) => void;
  toggleSpotlight: () => void;
  toggleLaunchpad?: () => void;
  soundEnabled: boolean;
}

export const Dock: React.FC<DockProps> = ({
  windows,
  onAppClick,
  toggleSpotlight,
  toggleLaunchpad,
  soundEnabled,
}) => {
  const [hoveredApp, setHoveredApp] = useState<string | null>(null);

  const getWindow = (id: AppId): WindowState | undefined => {
    if (Array.isArray(windows)) {
      return windows.find((w) => w.id === id);
    }
    return windows[id];
  };

  // Primary apps to highlight on compact mobile dock
  const PRIMARY_MOBILE_APP_IDS: AppId[] = ['workforce', 'research', 'products', 'finance'];

  return (
    <div className="fixed bottom-2.5 sm:bottom-3 left-0 right-0 flex justify-center items-end z-40 pointer-events-none px-2">
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 260 }}
        className="pointer-events-auto p-1.5 sm:p-2 bg-white/5 backdrop-blur-3xl rounded-2xl sm:rounded-3xl flex items-end space-x-1.5 sm:space-x-3 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.08)] max-w-full overflow-x-auto custom-scrollbar relative"
      >
        {/* Launchpad / Apps Drawer */}
        <div className="relative group flex-shrink-0">
          <motion.button
            id="dock-launchpad-btn"
            whileHover={{ scale: 1.08, y: -3 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              if (toggleLaunchpad) {
                toggleLaunchpad();
              } else {
                toggleSpotlight();
              }
            }}
            onMouseEnter={() => setHoveredApp('Launchpad')}
            onMouseLeave={() => setHoveredApp(null)}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-lg"
            title="Launchpad / All Apps"
          >
            <Grid className="w-4 h-4 sm:w-5 sm:h-5 opacity-80" />
          </motion.button>
          
          {hoveredApp === 'Launchpad' && (
            <div className="hidden sm:block absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/90 backdrop-blur-md text-[10px] tracking-wide text-white whitespace-nowrap shadow-lg border border-white/10 font-medium">
              Launchpad
            </div>
          )}
        </div>

        {/* Spotlight Search in Dock */}
        <div className="relative group flex-shrink-0">
          <motion.button
            id="dock-spotlight-btn"
            whileHover={{ scale: 1.08, y: -3 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              toggleSpotlight();
            }}
            onMouseEnter={() => setHoveredApp('Spotlight Search')}
            onMouseLeave={() => setHoveredApp(null)}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-indigo-400 hover:text-indigo-300 transition-all shadow-lg"
            title="Spotlight Search"
          >
            <Search className="w-4 h-4 sm:w-5 sm:h-5 opacity-80" />
          </motion.button>

          {hoveredApp === 'Spotlight Search' && (
            <div className="hidden sm:block absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/90 backdrop-blur-md text-[10px] tracking-wide text-white whitespace-nowrap shadow-lg border border-white/10 font-medium">
              Spotlight (⌘K)
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-[1px] h-7 sm:h-8 bg-white/10 self-center mx-0.5 sm:mx-1 flex-shrink-0" />

        {/* App Icons */}
        {APPS_CONFIG.map((app) => {
          const Icon = getAppIcon(app.iconName);
          const win = getWindow(app.id);
          const isOpen = win?.isOpen;
          const isMinimized = win?.isMinimized;
          const isPrimaryMobile = PRIMARY_MOBILE_APP_IDS.includes(app.id);

          return (
            <div
              key={app.id}
              className={`relative group flex flex-col items-center flex-shrink-0 ${
                !isPrimaryMobile ? 'hidden sm:flex' : 'flex'
              }`}
            >
              <motion.button
                id={`dock-app-${app.id}`}
                whileHover={{ scale: 1.08, y: -4 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  if (soundEnabled) playOSSound(isOpen && !isMinimized ? 'click' : 'open');
                  onAppClick(app.id);
                }}
                onMouseEnter={() => setHoveredApp(app.name)}
                onMouseLeave={() => setHoveredApp(null)}
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br ${app.color} p-2 sm:p-2.5 flex items-center justify-center text-white shadow-lg relative border border-white/15 hover:border-white/30 transition-all ${
                  isOpen && !isMinimized ? 'ring-2 ring-indigo-500/40 shadow-indigo-500/30' : ''
                }`}
              >
                <Icon className="w-5 h-5 sm:w-6 sm:h-6 drop-shadow" />

                {/* Badge if any */}
                {app.id === 'workforce' && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-400 rounded-full border-2 border-slate-900 shadow-sm animate-pulse" />
                )}
                {app.id === 'customers' && (
                  <span className="absolute -top-1.5 -right-1.5 px-1 sm:px-1.5 py-0.2 bg-indigo-500 text-[8px] sm:text-[9px] font-bold rounded-full border border-slate-900 shadow-sm">
                    12
                  </span>
                )}
              </motion.button>

              {/* Running Dot Indicator */}
              <div className="h-1.5 flex items-center justify-center mt-0.5 sm:mt-1">
                {isOpen && (
                  <div
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      isMinimized ? 'bg-slate-500' : 'bg-white shadow-[0_0_8px_#ffffff]'
                    }`}
                  />
                )}
              </div>

              {/* Tooltip */}
              {hoveredApp === app.name && (
                <div className="hidden sm:block absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/90 backdrop-blur-md text-[10px] tracking-wide text-white whitespace-nowrap shadow-xl border border-white/15 font-medium z-50">
                  <span>{app.name}</span>
                  {app.badge && (
                    <span className="ml-1.5 text-[9px] text-emerald-400 bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-500/30">
                      {app.badge}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
};

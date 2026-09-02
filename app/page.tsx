'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppId, OSNotification, WindowState } from '@/types/os';
import { INITIAL_WINDOWS, NOTIFICATIONS, WALLPAPERS } from '@/lib/os-data';
import { TopMenuBar } from '@/components/os/TopMenuBar';
import { Dock } from '@/components/os/Dock';
import { DesktopIcons } from '@/components/os/DesktopIcons';
import { OSWindow } from '@/components/os/OSWindow';
import { SpotlightSearch } from '@/components/os/SpotlightSearch';
import { ControlCenter } from '@/components/os/ControlCenter';
import { CalendarModal } from '@/components/os/CalendarModal';
import { NotificationsDrawer } from '@/components/os/NotificationsDrawer';
import { playOSSound } from '@/components/os/IconHelper';

// Apps
import { WorkforceApp } from '@/components/apps/WorkforceApp';
import { CompanyApp } from '@/components/apps/CompanyApp';
import { CustomersApp } from '@/components/apps/CustomersApp';
import { ResearchApp } from '@/components/apps/ResearchApp';
import { ProductsApp } from '@/components/apps/ProductsApp';
import { FinanceApp } from '@/components/apps/FinanceApp';
import { SettingsApp } from '@/components/apps/SettingsApp';
import { TerminalApp } from '@/components/apps/TerminalApp';
import { NotesApp } from '@/components/apps/NotesApp';

export default function SamJuniorsOSPage() {
  // Windows state
  const [windows, setWindows] = useState<WindowState[]>(INITIAL_WINDOWS);
  const [topZIndex, setTopZIndex] = useState(20);

  // Settings & OS state
  const [wallpaperId, setWallpaperId] = useState('elegant-dark');
  const [autonomyMode, setAutonomyMode] = useState('Fully Autonomous');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Modals & Drawers
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [isControlCenterOpen, setIsControlCenterOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<OSNotification[]>(NOTIFICATIONS);

  // Directives passed to Workforce
  const [pendingDirective, setPendingDirective] = useState<string>('');

  // Active wallpaper object
  const activeWallpaper = WALLPAPERS.find((w) => w.id === wallpaperId) || WALLPAPERS[0];

  // Window operations
  const bringToFront = useCallback(
    (id: AppId) => {
      setTopZIndex((prev) => {
        const nextZ = prev + 1;
        setWindows((wins) =>
          wins.map((w) => (w.id === id ? { ...w, zIndex: nextZ, isMinimized: false } : w))
        );
        return nextZ;
      });
    },
    []
  );

  const openApp = useCallback(
    (id: AppId, directive?: string) => {
      if (directive) {
        setPendingDirective(directive);
      }

      setWindows((prevWindows) => {
        const exists = prevWindows.find((w) => w.id === id);
        const nextZ = topZIndex + 1;
        setTopZIndex(nextZ);

        if (soundEnabled) playOSSound('open');

        if (exists) {
          return prevWindows.map((w) =>
            w.id === id ? { ...w, isOpen: true, isMinimized: false, zIndex: nextZ } : w
          );
        }

        // Fallback default window geometry if not in initial list
        const defaultTitle =
          id === 'workforce'
            ? 'Executive AI Workforce'
            : id === 'company'
            ? 'Company Governance & OKRs'
            : id === 'customers'
            ? 'Autonomous CRM & Accounts'
            : id === 'research'
            ? 'Market Intel & Research Radar'
            : id === 'products'
            ? 'Product Roadmap & PRDs'
            : id === 'finance'
            ? 'Finance & Token Economics'
            : id === 'settings'
            ? 'OS Settings & Autonomy'
            : id === 'terminal'
            ? 'SamJuniors CLI Terminal'
            : 'Founder Scratchpad';

        const newWin: WindowState = {
          id,
          title: defaultTitle,
          isOpen: true,
          isMinimized: false,
          isMaximized: false,
          zIndex: nextZ,
          position: { x: 80 + (prevWindows.length % 5) * 30, y: 70 + (prevWindows.length % 5) * 30 },
          size: { width: 880, height: 560 },
        };
        return [...prevWindows, newWin];
      });
    },
    [topZIndex, soundEnabled]
  );

  const closeApp = useCallback((id: AppId) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, isOpen: false } : w)));
  }, []);

  const minimizeApp = useCallback((id: AppId) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, isMinimized: true } : w)));
  }, []);

  const maximizeApp = useCallback((id: AppId) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isMaximized: !w.isMaximized } : w))
    );
  }, []);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K for Spotlight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSpotlightOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
  };

  const handleResetOS = () => {
    if (soundEnabled) playOSSound('open');
    setWindows(INITIAL_WINDOWS);
    setWallpaperId('obsidian-aurora');
    setAutonomyMode('Fully Autonomous');
    setNotifications(NOTIFICATIONS);
  };

  const renderAppContent = (id: AppId) => {
    switch (id) {
      case 'workforce':
        return (
          <WorkforceApp
            soundEnabled={soundEnabled}
            initialDirective={pendingDirective}
            onClearInitialDirective={() => setPendingDirective('')}
          />
        );
      case 'company':
        return <CompanyApp />;
      case 'customers':
        return <CustomersApp />;
      case 'research':
        return <ResearchApp />;
      case 'products':
        return <ProductsApp />;
      case 'finance':
        return <FinanceApp />;
      case 'settings':
        return (
          <SettingsApp
            currentWallpaper={wallpaperId}
            onSelectWallpaper={setWallpaperId}
            autonomyMode={autonomyMode}
            onSetAutonomyMode={setAutonomyMode}
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled((p) => !p)}
            onResetOS={handleResetOS}
          />
        );
      case 'terminal':
        return (
          <TerminalApp
            soundEnabled={soundEnabled}
            onDispatchDirective={(dir) => openApp('workforce', dir)}
          />
        );
      case 'notes':
        return (
          <NotesApp
            soundEnabled={soundEnabled}
            onDispatchToWorkforce={(note) => openApp('workforce', note)}
          />
        );
      default:
        return <div className="p-6 text-slate-400">Application not found.</div>;
    }
  };

  const activeWindow = windows.filter((w) => w.isOpen && !w.isMinimized).sort((a, b) => b.zIndex - a.zIndex)[0];
  const activeAppTitle = activeWindow ? activeWindow.title : 'SamJuniors OS';
  const activeAppId = activeWindow ? activeWindow.id : 'workforce';

  return (
    <main
      id="os-desktop-root"
      className="relative w-screen h-screen overflow-hidden select-none font-sans text-slate-200"
      style={{
        background: activeWallpaper.preview,
      }}
    >
      {/* Background Ambient Subtle Overlay Pattern & Deep Glow */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] bg-indigo-500/10 blur-[130px] rounded-full" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/15 via-transparent to-black/70 pointer-events-none" />

      {/* 1. Top System Menu Bar */}
      <TopMenuBar
        activeAppTitle={activeAppTitle}
        activeAppId={activeAppId}
        openApp={openApp}
        notifications={notifications}
        toggleNotifications={() => {
          setIsNotificationsOpen((p) => !p);
          setIsControlCenterOpen(false);
          setIsCalendarOpen(false);
        }}
        toggleControlCenter={() => {
          setIsControlCenterOpen((p) => !p);
          setIsCalendarOpen(false);
          setIsNotificationsOpen(false);
        }}
        toggleCalendar={() => {
          setIsCalendarOpen((p) => !p);
          setIsControlCenterOpen(false);
          setIsNotificationsOpen(false);
        }}
        toggleSpotlight={() => setIsSpotlightOpen(true)}
        soundEnabled={soundEnabled}
        toggleSound={() => setSoundEnabled((p) => !p)}
        autonomyMode={autonomyMode}
        onRestartOS={() => {
          setWindows(INITIAL_WINDOWS);
          if (soundEnabled) playOSSound('startup');
        }}
      />

      {/* 2. Desktop Workspace Icons & Quick Directive Dispatcher */}
      <DesktopIcons
        openApp={openApp}
        onQuickDirective={(dir) => openApp('workforce', dir)}
        soundEnabled={soundEnabled}
      />

      {/* 3. Window Manager & Open Windows */}
      {windows.map((win) => (
        <OSWindow
          key={win.id}
          window={win}
          onClose={closeApp}
          onMinimize={minimizeApp}
          onMaximize={maximizeApp}
          onFocus={bringToFront}
          soundEnabled={soundEnabled}
        >
          {renderAppContent(win.id)}
        </OSWindow>
      ))}

      {/* 4. Bottom Modern Dock */}
      <Dock
        windows={windows}
        onAppClick={openApp}
        toggleSpotlight={() => setIsSpotlightOpen(true)}
        soundEnabled={soundEnabled}
      />

      {/* 5. Modals & Overlays */}
      <SpotlightSearch
        isOpen={isSpotlightOpen}
        onClose={() => setIsSpotlightOpen(false)}
        onOpenApp={openApp}
        onDispatchDirective={(dir) => openApp('workforce', dir)}
        soundEnabled={soundEnabled}
      />

      <ControlCenter
        isOpen={isControlCenterOpen}
        onClose={() => setIsControlCenterOpen(false)}
        autonomyMode={autonomyMode}
        onSetAutonomyMode={setAutonomyMode}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((p) => !p)}
        onOpenSettings={() => openApp('settings')}
      />

      <CalendarModal
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        onOpenWorkforce={() => openApp('workforce')}
      />

      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onDismiss={handleDismissNotification}
        onClearAll={handleClearAllNotifications}
        soundEnabled={soundEnabled}
      />
    </main>
  );
}

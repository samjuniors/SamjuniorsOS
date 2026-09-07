'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppId, OSNotification, WindowState, AdvisorTargetContext } from '@/types/os';
import { INITIAL_WINDOWS, NOTIFICATIONS, WALLPAPERS } from '@/lib/os-data';
import { TopMenuBar } from '@/components/os/TopMenuBar';
import { Dock } from '@/components/os/Dock';
import { DesktopIcons } from '@/components/os/DesktopIcons';
import { OSWindow } from '@/components/os/OSWindow';
import { SpotlightSearch } from '@/components/os/SpotlightSearch';
import { ControlCenter } from '@/components/os/ControlCenter';
import { CalendarModal } from '@/components/os/CalendarModal';
import { NotificationsDrawer } from '@/components/os/NotificationsDrawer';
import { NotificationToasts } from '@/components/os/NotificationToasts';
import { playOSSound } from '@/components/os/IconHelper';
import { NotificationStore, ToastItem } from '@/lib/notification-center';
import { ContextMenu, ContextMenuState } from '@/components/os/ContextMenu';
import {
  Sparkles,
  MessageSquare,
  Terminal as TerminalIcon,
  Minimize2,
  Volume2,
  VolumeX,
  Shield,
  Activity,
  Zap,
  RotateCcw,
  Search as SearchIcon,
  Play
} from 'lucide-react';

// Apps
import { WorkforceApp } from '@/components/apps/WorkforceApp';
import { AdvisorApp } from '@/components/apps/AdvisorApp';
import { CompanyApp } from '@/components/apps/CompanyApp';
import { CustomersApp } from '@/components/apps/CustomersApp';
import { ResearchApp } from '@/components/apps/ResearchApp';
import { ProductsApp } from '@/components/apps/ProductsApp';
import { FinanceApp } from '@/components/apps/FinanceApp';
import { SettingsApp } from '@/components/apps/SettingsApp';
import { TerminalApp } from '@/components/apps/TerminalApp';
import { NotesApp } from '@/components/apps/NotesApp';
import { MessagesApp, ParticipantId } from '@/components/apps/MessagesApp';
import { ExecutiveCockpit } from '@/components/cockpit/ExecutiveCockpit';

export default function SamJuniorsOSPage() {
  // Operational Mode State (Default: Executive Cockpit, with toggle to Classic Desktop)
  const [viewMode, setViewMode] = useState<'cockpit' | 'classic'>('cockpit');

  // Windows state
  const [windows, setWindows] = useState<WindowState[]>(INITIAL_WINDOWS);
  const [topZIndex, setTopZIndex] = useState(20);

  // Settings & OS state
  const [wallpaperId, setWallpaperId] = useState('elegant-dark');
  const [autonomyMode, setAutonomyMode] = useState('Fully Autonomous');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Context Menu State
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });

  // Modals & Drawers
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [isControlCenterOpen, setIsControlCenterOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<OSNotification[]>(() => NotificationStore.getState().notifications);
  const [activeToasts, setActiveToasts] = useState<ToastItem[]>(() => NotificationStore.getState().activeToasts);

  // Directives passed to Workforce
  const [pendingDirective, setPendingDirective] = useState<string>('');
  const [advisorTargetContext, setAdvisorTargetContext] = useState<AdvisorTargetContext | null>(null);

  // Active wallpaper object
  const activeWallpaper = WALLPAPERS.find((w) => w.id === wallpaperId) || WALLPAPERS[0];

  // Window operations
  const bringToFront = useCallback(
    (id: AppId) => {
      setTopZIndex((prev) => {
        const nextZ = prev + 1;

        // Normalize z-indices when they grow too large to prevent unbounded growth
        if (nextZ > 500) {
          setWindows((wins) => {
            const sorted = [...wins].sort((a, b) => a.zIndex - b.zIndex);
            return wins.map((w) => ({
              ...w,
              zIndex: w.id === id ? sorted.length + 20 : sorted.indexOf(w) + 20,
              isMinimized: w.id === id ? false : w.isMinimized,
            }));
          });
          // Reset counter — max possible z-index after normalization is windows.length + 20
          return 30;
        }

        setWindows((wins) =>
          wins.map((w) => (w.id === id ? { ...w, zIndex: nextZ, isMinimized: false } : w))
        );
        return nextZ;
      });
    },
    []
  );

  const openApp = useCallback(
    (id: AppId | string, directive?: string, targetContext?: AdvisorTargetContext) => {
      if (directive) {
        setPendingDirective(directive);
      }
      if (targetContext) {
        setAdvisorTargetContext(targetContext);
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
          id === 'messages'
            ? 'Messages'
            : id === 'advisor'
            ? 'Founder Intelligence'
            : id === 'workforce'
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
          id: id as AppId,
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

  // Subscribe to NotificationStore updates (notifications list & active toast popups)
  useEffect(() => {
    NotificationStore.setSoundEnabled(soundEnabled);
    const syncState = () => {
      const state = NotificationStore.getState();
      setNotifications([...state.notifications]);
      setActiveToasts([...state.activeToasts]);
    };

    const unsubscribe = NotificationStore.subscribe(syncState);
    return () => unsubscribe();
  }, [soundEnabled]);

  const handleDismissNotification = (id: string) => {
    NotificationStore.dismissNotification(id);
  };

  const handleClearAllNotifications = () => {
    NotificationStore.clearAll();
  };

  const handleResetOS = () => {
    if (soundEnabled) playOSSound('open');
    setWindows(INITIAL_WINDOWS);
    setWallpaperId('obsidian-aurora');
    setAutonomyMode('Fully Autonomous');
    NotificationStore.resetToDefaults();
  };

  const renderAppContent = (id: AppId) => {
    switch (id) {
      case 'messages':
        return (
          <MessagesApp
            soundEnabled={soundEnabled}
            onOpenApp={openApp}
          />
        );
      case 'advisor':
        return (
          <AdvisorApp
            soundEnabled={soundEnabled}
            onOpenApp={openApp}
            targetContext={advisorTargetContext}
            onClearTargetContext={() => setAdvisorTargetContext(null)}
          />
        );
      case 'workforce':
        return (
          <WorkforceApp
            soundEnabled={soundEnabled}
            initialDirective={pendingDirective}
            onClearInitialDirective={() => setPendingDirective('')}
            onAskAdvisor={(ctx) => openApp('advisor', undefined, ctx)}
          />
        );
      case 'company':
        return <CompanyApp onOpenApp={(appId, param) => openApp(appId as AppId, param)} soundEnabled={soundEnabled} />;
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
            onOpenApp={openApp}
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

  // Desktop Wallpaper Right-Click Context Menu
  const handleDesktopContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('.os-window')) {
      return;
    }

    e.preventDefault();
    setContextMenuState({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      title: 'SamJuniors OS',
      items: [
        {
          id: 'launch-directive',
          label: 'Dispatch Executive Directive',
          icon: Zap,
          shortcut: '⌘N',
          onClick: () => openApp('workforce'),
        },
        {
          id: 'open-spotlight',
          label: 'Spotlight Search',
          icon: SearchIcon,
          shortcut: '⌘K',
          onClick: () => setIsSpotlightOpen(true),
        },
        {
          id: 'open-messages',
          label: 'Direct Messages',
          icon: MessageSquare,
          onClick: () => openApp('messages'),
        },
        {
          id: 'open-terminal',
          label: 'Command Terminal',
          icon: TerminalIcon,
          onClick: () => openApp('terminal'),
        },
        { id: 'sep-desk-1', label: '', isSeparator: true },
        {
          id: 'minimize-all',
          label: 'Minimize All Windows',
          icon: Minimize2,
          shortcut: '⌘M',
          onClick: () => {
            setWindows((wins) => wins.map((w) => ({ ...w, isMinimized: true })));
            if (soundEnabled) playOSSound('minimize');
          },
        },
        {
          id: 'toggle-sound',
          label: soundEnabled ? 'Mute System Audio' : 'Unmute System Audio',
          icon: soundEnabled ? VolumeX : Volume2,
          onClick: () => {
            setSoundEnabled((prev) => !prev);
            if (!soundEnabled) playOSSound('pop');
          },
        },
        { id: 'sep-desk-2', label: '', isSeparator: true },
        {
          id: 'clean-restart',
          label: 'Reset Workspace Windows',
          icon: RotateCcw,
          onClick: () => {
            setWindows(INITIAL_WINDOWS);
            if (soundEnabled) playOSSound('startup');
          },
        },
      ],
    });
  };

  // App Icon Right-Click Menu
  const handleAppContextMenu = (e: React.MouseEvent, app: any) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuState({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      title: app.name,
      items: [
        {
          id: 'open-app',
          label: `Open ${app.name}`,
          icon: Play,
          shortcut: '↵',
          onClick: () => openApp(app.id),
        },
        {
          id: 'app-directive',
          label: 'Execute App Directive',
          icon: Zap,
          onClick: () => openApp(app.id),
        },
        { id: 'sep-app-1', label: '', isSeparator: true },
        {
          id: 'app-inspect',
          label: `Inspect ${app.category}`,
          icon: Activity,
          onClick: () => openApp('settings'),
        },
      ],
    });
  };

  if (viewMode === 'cockpit') {
    return (
      <ExecutiveCockpit
        onSwitchToClassic={() => setViewMode('classic')}
        onOpenApp={(appId) => {
          setViewMode('classic');
          openApp(appId as AppId);
        }}
        onDispatchDirective={(directive) => {
          setPendingDirective(directive);
          openApp('workforce', directive);
        }}
      />
    );
  }

  return (
    <main
      id="os-desktop-root"
      onContextMenu={handleDesktopContextMenu}
      className="relative w-screen h-screen overflow-hidden select-none font-sans text-slate-200"
      style={{
        background: activeWallpaper.preview,
      }}
    >
      {/* Quick Return to Executive Cockpit */}
      <div className="fixed top-9 right-4 z-50">
        <button
          onClick={() => setViewMode('cockpit')}
          className="flex items-center space-x-1.5 px-3 py-1 bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold rounded-full shadow-lg border border-indigo-400/40 backdrop-blur-md transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Executive Cockpit</span>
        </button>
      </div>

      {/* Universal Desktop Context Menu */}
      <ContextMenu
        state={contextMenuState}
        onClose={() => setContextMenuState((prev) => ({ ...prev, isOpen: false }))}
        soundEnabled={soundEnabled}
      />

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
        onAppContextMenu={handleAppContextMenu}
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
        onOpenApp={openApp}
        soundEnabled={soundEnabled}
      />

      {/* 6. Real-Time Subtle Toast Pop-ups */}
      <NotificationToasts
        toasts={activeToasts}
        onOpenApp={openApp}
        soundEnabled={soundEnabled}
      />
    </main>
  );
}

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  Zap,
  ExternalLink,
  Bot,
  Building2,
  Sparkles,
  DollarSign,
  Search,
  Filter,
  SlidersHorizontal,
  X,
  Radio,
  PlusCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AppId, OSNotification } from '@/types/os';
import { NotificationCategory, NotificationStore, NotificationStoreState } from '@/lib/notification-center';
import { playOSSound } from './IconHelper';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: OSNotification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onOpenApp?: (appId: AppId) => void;
  soundEnabled: boolean;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onDismiss,
  onClearAll,
  onOpenApp,
  soundEnabled,
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | NotificationCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  if (!isOpen) return null;

  // Filter calculations
  const filteredNotifications = notifications.filter((notif) => {
    // Category match
    if (activeCategory !== 'all') {
      if (notif.category) {
        if (notif.category !== activeCategory) return false;
      } else {
        // Fallback matching
        if (activeCategory === 'ai_employee' && notif.type !== 'agent') return false;
        if (activeCategory === 'company_update' && notif.type !== 'company' && notif.type !== 'deal' && notif.type !== 'finance') return false;
        if (activeCategory === 'system_event' && notif.type !== 'system' && notif.type !== 'governance' && notif.type !== 'security') return false;
      }
    }

    // Unread filter
    if (showOnlyUnread && notif.read) return false;

    // Search query match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = notif.title.toLowerCase().includes(q);
      const matchMsg = notif.message.toLowerCase().includes(q);
      const matchAgent = notif.agent?.toLowerCase().includes(q);
      return matchTitle || matchMsg || matchAgent;
    }

    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const aiCount = notifications.filter((n) => n.category === 'ai_employee' || n.type === 'agent').length;
  const systemCount = notifications.filter((n) => n.category === 'system_event' || n.type === 'system' || n.type === 'security').length;
  const companyCount = notifications.filter((n) => n.category === 'company_update' || n.type === 'company' || n.type === 'deal' || n.type === 'finance').length;

  const getCategoryIcon = (notification: OSNotification) => {
    if (notification.category === 'ai_employee' || notification.type === 'agent') {
      return <Bot className="w-3.5 h-3.5 text-indigo-400" />;
    }
    if (notification.category === 'company_update' || notification.type === 'company' || notification.type === 'deal') {
      return <Building2 className="w-3.5 h-3.5 text-rose-400" />;
    }
    if (notification.type === 'finance') {
      return <DollarSign className="w-3.5 h-3.5 text-emerald-400" />;
    }
    return <Zap className="w-3.5 h-3.5 text-amber-400" />;
  };

  const getPriorityBadge = (priority?: string) => {
    if (priority === 'critical') {
      return (
        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
          CRITICAL
        </span>
      );
    }
    if (priority === 'high') {
      return (
        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
          HIGH
        </span>
      );
    }
    return null;
  };

  return (
    <div
      id="os-notifications-center-overlay"
      className="fixed inset-0 z-50 pointer-events-none"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute top-9 right-8 w-96 max-w-[95vw] os-glass rounded-2xl p-4 border border-white/20 shadow-2xl space-y-3.5 text-xs text-slate-100 max-h-[85vh] flex flex-col select-none"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-xs">Notification Center</span>
                {unreadCount > 0 ? (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {unreadCount} unread
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    all read
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Autonomous swarm alerts & system events</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {unreadCount > 0 && (
              <button
                id="notif-mark-all-read-btn"
                onClick={() => {
                  if (soundEnabled) playOSSound('click');
                  NotificationStore.markAllAsRead();
                }}
                title="Mark all notifications as read"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5 text-indigo-400" />
              </button>
            )}

            {notifications.length > 0 && (
              <button
                id="notif-clear-all-btn"
                onClick={() => {
                  if (soundEnabled) playOSSound('click');
                  onClearAll();
                }}
                title="Clear all notifications"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              id="notif-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Category Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-shrink-0 text-[11px]">
          <button
            id="notif-tab-all"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              setActiveCategory('all');
            }}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
              activeCategory === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            <span>All</span>
            <span className="text-[10px] font-mono opacity-80">({notifications.length})</span>
          </button>

          <button
            id="notif-tab-ai"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              setActiveCategory('ai_employee');
            }}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
              activeCategory === 'ai_employee'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            <Bot className="w-3 h-3 text-indigo-300" />
            <span>AI Employees</span>
            <span className="text-[10px] font-mono opacity-80">({aiCount})</span>
          </button>

          <button
            id="notif-tab-system"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              setActiveCategory('system_event');
            }}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
              activeCategory === 'system_event'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-300" />
            <span>System</span>
            <span className="text-[10px] font-mono opacity-80">({systemCount})</span>
          </button>

          <button
            id="notif-tab-company"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              setActiveCategory('company_update');
            }}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
              activeCategory === 'company_update'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            <Building2 className="w-3 h-3 text-rose-300" />
            <span>Company</span>
            <span className="text-[10px] font-mono opacity-80">({companyCount})</span>
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              id="notif-search-input"
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            id="notif-filter-unread-btn"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              setShowOnlyUnread(!showOnlyUnread);
            }}
            title={showOnlyUnread ? 'Showing unread only' : 'Showing all'}
            className={`px-2 py-1.5 rounded-lg border text-[10px] font-medium flex items-center gap-1 transition-colors ${
              showOnlyUnread
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            {showOnlyUnread ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>Unread</span>
          </button>

          <button
            id="notif-simulator-toggle-btn"
            onClick={() => {
              if (soundEnabled) playOSSound('click');
              setIsSimulatorOpen(!isSimulatorOpen);
            }}
            title="Notification Trigger Simulator"
            className={`px-2 py-1.5 rounded-lg border text-[10px] font-medium flex items-center gap-1 transition-colors ${
              isSimulatorOpen
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Test</span>
          </button>
        </div>

        {/* Trigger Simulator Quick Actions (Collapsible) */}
        <AnimatePresence>
          {isSimulatorOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-2 flex-shrink-0 overflow-hidden"
            >
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-indigo-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Trigger Live Test Event:
                </span>
                <span className="text-slate-400 text-[9px]">Simulates swarm triggers</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  id="sim-btn-ai-action"
                  onClick={() => {
                    NotificationStore.simulateAIEmployeeAction();
                  }}
                  className="px-2 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-200 text-[10px] font-semibold flex items-center justify-center gap-1 transition-all active:scale-95"
                >
                  <Bot className="w-3 h-3" />
                  <span>+ AI Action</span>
                </button>
                <button
                  id="sim-btn-system-event"
                  onClick={() => {
                    NotificationStore.simulateSystemEvent();
                  }}
                  className="px-2 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/30 text-amber-200 text-[10px] font-semibold flex items-center justify-center gap-1 transition-all active:scale-95"
                >
                  <Zap className="w-3 h-3" />
                  <span>+ System</span>
                </button>
                <button
                  id="sim-btn-company-update"
                  onClick={() => {
                    NotificationStore.simulateCompanyUpdate();
                  }}
                  className="px-2 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/30 text-rose-200 text-[10px] font-semibold flex items-center justify-center gap-1 transition-all active:scale-95"
                >
                  <Building2 className="w-3 h-3" />
                  <span>+ Company</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scrollable Notifications List */}
        <div className="space-y-2 overflow-y-auto flex-1 pr-1 max-h-80">
          <AnimatePresence mode="popLayout">
            {filteredNotifications.map((notif) => {
              const isUnread = !notif.read;

              return (
                <motion.div
                  key={notif.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`p-3 rounded-xl border transition-all relative group ${
                    isUnread
                      ? 'bg-slate-900/80 border-indigo-500/30 hover:border-indigo-500/50'
                      : 'bg-black/30 border-white/5 hover:border-white/15'
                  }`}
                >
                  {/* Top line: unread dot, icon, origin, priority, timestamp */}
                  <div className="flex items-center justify-between pb-1 gap-2">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      {isUnread ? (
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-600 flex-shrink-0" />
                      )}
                      <div className="w-4 h-4 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                        {getCategoryIcon(notif)}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono truncate">
                        {notif.agent || notif.type.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      {getPriorityBadge(notif.priority)}
                      <span className="text-[9px] font-mono text-slate-500">{notif.time}</span>
                    </div>
                  </div>

                  {/* Notification Content */}
                  <div className="space-y-1 mt-0.5">
                    <h5 className={`text-[11px] font-bold leading-tight ${isUnread ? 'text-white' : 'text-slate-300'}`}>
                      {notif.title}
                    </h5>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {notif.message}
                    </p>
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/5 text-[10px]">
                    <div className="flex items-center space-x-2">
                      {notif.appTarget && onOpenApp && (
                        <button
                          onClick={() => {
                            if (soundEnabled) playOSSound('open');
                            NotificationStore.markAsRead(notif.id);
                            onOpenApp(notif.appTarget!);
                            onClose();
                          }}
                          className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors group-hover:underline"
                        >
                          <span>{notif.actionLabel || `Open ${notif.appTarget}`}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center space-x-1">
                      {/* Mark Read/Unread toggle */}
                      <button
                        onClick={() => {
                          if (soundEnabled) playOSSound('click');
                          if (isUnread) {
                            NotificationStore.markAsRead(notif.id);
                          } else {
                            NotificationStore.markAsUnread(notif.id);
                          }
                        }}
                        title={isUnread ? 'Mark as read' : 'Mark as unread'}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Check className="w-3 h-3" />
                      </button>

                      {/* Dismiss button */}
                      <button
                        onClick={() => {
                          if (soundEnabled) playOSSound('click');
                          onDismiss(notif.id);
                        }}
                        title="Dismiss notification"
                        className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredNotifications.length === 0 && (
            <div className="p-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-white/5 mx-auto flex items-center justify-center text-slate-500">
                <Bell className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {searchQuery || showOnlyUnread || activeCategory !== 'all'
                  ? 'No notifications match your current filter.'
                  : 'All clear! No pending notifications.'}
              </p>
              <div className="pt-2">
                <button
                  onClick={() => {
                    NotificationStore.simulateAIEmployeeAction();
                  }}
                  className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-[10px] font-medium transition-colors"
                >
                  Generate sample alert
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

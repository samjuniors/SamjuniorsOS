import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare, Volume2, User } from 'lucide-react';
import { SofiaMessage } from '../types/sofia';

interface TranscriptDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: SofiaMessage[];
}

export const TranscriptDrawer: React.FC<TranscriptDrawerProps> = ({
  isOpen,
  onClose,
  messages
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed top-0 left-0 bottom-0 z-50 w-full max-w-sm bg-[#0c1017] border-r border-white/10 p-6 flex flex-col justify-between overflow-hidden text-slate-200 select-none shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Conversation Memory</h2>
                  <p className="text-xs text-slate-400">Live spoken transcripts</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto my-4 space-y-4 pr-1">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <Volume2 className="w-8 h-8 text-slate-600 mb-3" />
                  <p className="text-sm font-medium text-slate-400">No spoken exchanges yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Say "Hey Sofia" or speak directly to start the conversation.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1 px-1">
                      {msg.role === 'user' ? (
                        <>
                          <span>You</span>
                          <User className="w-3 h-3" />
                        </>
                      ) : (
                        <>
                          <span className="text-cyan-400 font-medium">Sofia</span>
                          {msg.emotion && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-white/5 rounded text-slate-400">
                              {msg.emotion}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div
                      className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] ${
                        msg.role === 'user'
                          ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/30 rounded-tr-none'
                          : 'bg-white/[0.04] text-slate-200 border border-white/10 rounded-tl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-white/10 text-[11px] text-slate-400 text-center shrink-0">
              Sofia remembers context across your conversation
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

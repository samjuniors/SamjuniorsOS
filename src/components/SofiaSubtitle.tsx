import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Emotion, SofiaSubtitleData } from '../types/sofia';

interface SofiaSubtitleProps {
  subtitle: SofiaSubtitleData | null;
  emotion: Emotion;
}

export const SofiaSubtitle: React.FC<SofiaSubtitleProps> = ({
  subtitle,
  emotion
}) => {
  // Emotion styling for active word highlight and ambient glow
  const getEmotionGlow = () => {
    switch (emotion) {
      case 'happiness':
        return {
          text: 'text-amber-200',
          glow: 'rgba(251, 191, 36, 0.45)',
          border: 'border-amber-400/20',
          dot: 'bg-amber-400'
        };
      case 'curiosity':
        return {
          text: 'text-violet-200',
          glow: 'rgba(167, 139, 250, 0.5)',
          border: 'border-violet-400/20',
          dot: 'bg-violet-400'
        };
      case 'calmness':
        return {
          text: 'text-teal-200',
          glow: 'rgba(45, 212, 191, 0.4)',
          border: 'border-teal-400/20',
          dot: 'bg-teal-400'
        };
      case 'excitement':
        return {
          text: 'text-rose-200',
          glow: 'rgba(244, 63, 94, 0.5)',
          border: 'border-rose-400/20',
          dot: 'bg-rose-400'
        };
      case 'empathy':
        return {
          text: 'text-purple-200',
          glow: 'rgba(192, 132, 252, 0.45)',
          border: 'border-purple-400/20',
          dot: 'bg-purple-400'
        };
      case 'playfulness':
        return {
          text: 'text-pink-200',
          glow: 'rgba(236, 72, 153, 0.45)',
          border: 'border-pink-400/20',
          dot: 'bg-pink-400'
        };
      case 'concern':
        return {
          text: 'text-orange-200',
          glow: 'rgba(251, 146, 60, 0.4)',
          border: 'border-orange-400/20',
          dot: 'bg-orange-400'
        };
      case 'surprise':
        return {
          text: 'text-emerald-200',
          glow: 'rgba(52, 211, 153, 0.45)',
          border: 'border-emerald-400/20',
          dot: 'bg-emerald-400'
        };
      default:
        return {
          text: 'text-cyan-200',
          glow: 'rgba(56, 189, 248, 0.45)',
          border: 'border-cyan-400/20',
          dot: 'bg-cyan-400'
        };
    }
  };

  const style = getEmotionGlow();

  const isVisible = Boolean(
    subtitle &&
    subtitle.words &&
    subtitle.words.length > 0 &&
    subtitle.visibleCount > 0
  );

  return (
    <div className="relative min-h-[72px] w-full flex items-center justify-center pointer-events-none mt-2 px-4 select-none">
      <AnimatePresence>
        {isVisible && subtitle && (
          <motion.div
            key={subtitle.phraseId}
            initial={{ opacity: 0, y: 4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99, transition: { duration: 0.08, ease: 'easeOut' } }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            className={`relative max-w-lg w-auto px-5 py-3 rounded-2xl bg-[#0c1017]/85 backdrop-blur-md border ${style.border} shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col items-center text-center`}
            style={{
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${style.glow}`
            }}
          >
            {/* Word-by-word text container */}
            <p className="text-sm md:text-base leading-relaxed tracking-normal flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
              {subtitle.words.slice(0, subtitle.visibleCount).map((word, index) => {
                const isActive = index === subtitle.activeIndex && subtitle.isSpeaking;
                const isRecent = index === subtitle.visibleCount - 1;

                return (
                  <motion.span
                    key={`${index}-${word}`}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{
                      opacity: 1,
                      scale: isActive ? 1.04 : 1
                    }}
                    transition={{
                      duration: 0.1,
                      ease: 'easeOut'
                    }}
                    className={`inline-block transition-colors duration-100 ${
                      isActive
                        ? `${style.text} font-medium drop-shadow-[0_0_10px_rgba(255,255,255,0.6)]`
                        : isRecent
                        ? 'text-white'
                        : 'text-slate-300/90'
                    }`}
                  >
                    {word}
                  </motion.span>
                );
              })}
            </p>

            {/* Subtle speaking pulse indicator line */}
            {subtitle.isSpeaking && (
              <motion.div
                initial={{ opacity: 0, width: '0%' }}
                animate={{ opacity: 0.7, width: '45%' }}
                exit={{ opacity: 0, width: '0%' }}
                className={`h-[1.5px] mt-2 rounded-full ${style.dot}`}
                style={{
                  boxShadow: `0 0 8px ${style.glow}`
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { ParticleRenderer } from '../sofia/engine/ParticleRenderer';
import { VisualDirector, THEMES, type ThemeId, type ShapeTune } from '../sofia/engine/VisualDirector';
import { STAGE_CY_CENTERED } from '../sofia/engine/layout';
import type { SophiaShape, SophiaStateName } from '../sofia/engine/types';
import type { SophiaForm } from '../sofia/engine/ShapeGenerator';
import { AudioMetrics, Emotion, SofiaState } from '../types/sofia';

export interface SofiaOrbProps {
  state: SofiaState;
  emotion: Emotion;
  audioMetrics: AudioMetrics;
  onTap?: () => void;
  className?: string;
  shape?: SophiaShape;
  onlyParticles?: boolean;
  theme?: ThemeId;
  form?: SophiaForm;
}

const STATE_MAP: Record<SofiaState, SophiaStateName> = {
  BOOT: 'wakeup',
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  INTERRUPTED: 'focusing',
  PAUSED: 'paused',
  ERROR: 'blocked',
};

export const SofiaOrb: React.FC<SofiaOrbProps> = ({
  state,
  emotion,
  audioMetrics,
  onTap,
  className,
  shape = 'organic',
  onlyParticles = false,
  theme = 'studio',
  form = 'sphere',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ParticleRenderer | null>(null);
  const directorRef = useRef<VisualDirector | null>(null);
  const [glFailed, setGlFailed] = useState(false);

  // Keep live references so RAF loop reads latest values without reattaching WebGL2
  const stateRef = useRef(state);
  stateRef.current = state;
  const audioMetricsRef = useRef(audioMetrics);
  audioMetricsRef.current = audioMetrics;
  const emotionRef = useRef(emotion);
  emotionRef.current = emotion;

  // Initialize WebGL2 ParticleRenderer & VisualDirector on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: ParticleRenderer;
    try {
      renderer = new ParticleRenderer(canvas, { stageCyRatio: STAGE_CY_CENTERED });
      rendererRef.current = renderer;
    } catch (err) {
      console.warn('[SofiaOrb] WebGL2 particle renderer unavailable, using fallback:', err);
      setGlFailed(true);
      return;
    }

    const director = new VisualDirector();
    directorRef.current = director;

    // Apply baseline tuned parameters: scale, glow, onlyParticles
    director.setTune({
      scale: 1.15,
      onlyParticles,
      glow: 1.25,
      sparkle: 1.15,
      dustVisible: true,
      dustAmount: 1.0,
      dustSpeed: 0.8,
    });

    if (form) {
      director.setForm(form);
    }

    if (shape && shape !== 'organic') {
      director.requestTransform(shape, renderer);
    }

    // Prefers-reduced-motion media query
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    director.setReduced(motionQuery.matches);
    const handleMotion = (e: MediaQueryListEvent) => director.setReduced(e.matches);
    motionQuery.addEventListener('change', handleMotion);

    let animationId = 0;
    let previousTime = performance.now();

    const loop = (now: number) => {
      animationId = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.0005, (now - previousTime) / 1000));
      previousTime = now;

      // Update active director state
      const mappedState = STATE_MAP[stateRef.current] || 'idle';
      director.state = mappedState;

      // Audio responsiveness
      const metrics = audioMetricsRef.current;
      const curState = stateRef.current;
      const rms = metrics.rms || 0;
      const peak = metrics.peak || 0;
      const rawEnergy = Math.max(rms, peak * 0.7);

      let mic = 0;
      let play = 0;
      if (curState === 'LISTENING' || curState === 'IDLE') {
        mic = Math.min(1.0, rawEnergy * 2.8);
      } else if (curState === 'SPEAKING') {
        play = Math.min(1.0, rawEnergy * 2.8);
      }

      // Generate per-frame particle parameters & dispatch to GPU
      const params = director.frame(dt, { mic, play });
      renderer.frame(params);
    };

    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
      motionQuery.removeEventListener('change', handleMotion);
      renderer.dispose();
      rendererRef.current = null;
      directorRef.current = null;
    };
  }, []);

  // Update shape morphs when shape prop changes
  useEffect(() => {
    const director = directorRef.current;
    const renderer = rendererRef.current;
    if (!director || !renderer) return;

    if (shape) {
      director.requestTransform(shape, renderer);
    }
  }, [shape]);

  // Update onlyParticles toggle
  useEffect(() => {
    const director = directorRef.current;
    if (!director) return;
    director.setTune({
      onlyParticles: !!onlyParticles,
      orbits: !onlyParticles,
      waves: !onlyParticles,
    });
  }, [onlyParticles]);

  // Update form (sphere ⇄ ring)
  useEffect(() => {
    const director = directorRef.current;
    if (!director || !form) return;
    director.setForm(form);
  }, [form]);

  // Update theme preset (studio, deepgram, emerald)
  useEffect(() => {
    const director = directorRef.current;
    if (!director || !theme) return;
    const foundTheme = THEMES.find((t) => t.id === theme);
    if (foundTheme) {
      director.setTune(foundTheme.tune);
      director.setForm(foundTheme.form);
    }
  }, [theme]);

  // Update emotion tint & glow
  useEffect(() => {
    const director = directorRef.current;
    if (!director) return;

    let hue = -0.62;
    let glow = 1.20;
    switch (emotion) {
      case 'happiness':
        hue = 0.35;
        glow = 1.25;
        break;
      case 'curiosity':
        hue = 0.75;
        glow = 1.30;
        break;
      case 'calmness':
        hue = -0.45;
        glow = 1.05;
        break;
      case 'excitement':
        hue = 0.95;
        glow = 1.40;
        break;
      case 'empathy':
        hue = 0.60;
        glow = 1.20;
        break;
      case 'playfulness':
        hue = 0.85;
        glow = 1.32;
        break;
      case 'concern':
        hue = -0.20;
        glow = 1.10;
        break;
      case 'surprise':
        hue = 0.15;
        glow = 1.35;
        break;
      default:
        hue = -0.62;
        glow = 1.20;
        break;
    }
    director.setTune({ hue, glow });
  }, [emotion]);

  // Trigger wake shockwave on boot
  useEffect(() => {
    if (state === 'BOOT') {
      directorRef.current?.playWake();
    }
  }, [state]);

  return (
    <div
      onClick={onTap}
      className={`relative flex items-center justify-center w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] aspect-square cursor-pointer group select-none ${
        className || ''
      }`}
      title={
        state === 'PAUSED'
          ? "Sofia is paused. Click to resume or say 'Hey Sofia'"
          : "Click orb to pause/resume Sofia"
      }
    >
      {/* Outer ambient glow reacting to emotion and audio */}
      <div
        className="absolute -inset-4 rounded-full blur-2xl opacity-40 transition-all duration-700 pointer-events-none group-hover:opacity-70"
        style={{
          background:
            emotion === 'happiness'
              ? 'radial-gradient(circle, rgba(251,191,36,0.45) 0%, transparent 70%)'
              : emotion === 'curiosity'
              ? 'radial-gradient(circle, rgba(167,139,250,0.5) 0%, transparent 70%)'
              : emotion === 'excitement'
              ? 'radial-gradient(circle, rgba(244,63,94,0.5) 0%, transparent 70%)'
              : emotion === 'calmness'
              ? 'radial-gradient(circle, rgba(45,212,191,0.45) 0%, transparent 70%)'
              : emotion === 'playfulness'
              ? 'radial-gradient(circle, rgba(236,72,153,0.5) 0%, transparent 70%)'
              : emotion === 'empathy'
              ? 'radial-gradient(circle, rgba(192,132,252,0.45) 0%, transparent 70%)'
              : emotion === 'concern'
              ? 'radial-gradient(circle, rgba(251,146,60,0.45) 0%, transparent 70%)'
              : emotion === 'surprise'
              ? 'radial-gradient(circle, rgba(52,211,153,0.45) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(56,189,248,0.45) 0%, transparent 70%)',
          transform: `scale(${1 + Math.min(0.25, (audioMetrics.rms || 0) * 1.2)})`,
        }}
      />

      {/* WebGL2 Particle Orb Stage Lens */}
      <div className="relative w-full h-full rounded-full overflow-hidden shadow-[0_0_80px_rgba(56,189,248,0.2)] border border-cyan-500/25 bg-[#030611] transition-all duration-500 group-hover:border-cyan-400/50 group-hover:shadow-[0_0_110px_rgba(56,189,248,0.35)]">
        <canvas
          ref={canvasRef}
          className="w-full h-full block transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />

        {/* Fallback if WebGL2 is disabled */}
        {glFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-cyan-950/20 rounded-full border border-cyan-500/30">
            <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 blur-xl opacity-60 animate-pulse" />
          </div>
        )}

        {/* Paused state overlay */}
        {state === 'PAUSED' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] pointer-events-none transition-opacity">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/70 border border-amber-400/50 text-amber-300 text-xs font-medium shadow-xl">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Sofia Paused • Tap to resume
            </div>
          </div>
        )}
      </div>

      {/* Touch ripple hover hint */}
      <div className="absolute inset-0 rounded-full border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
};

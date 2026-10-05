/**
 * [SofiaUI voice-presence engine — reference port]
 * Ported from SofiaUI (github.com/samjuniors/SofiaUI) @ commit 9e88dee:
 *   src/sophia/ParticleRenderer.ts
 * Port status: verbatim. The SofiaUI repository remains independent;
 * this is a one-way port into SamJuniorsOS per the approved migration plan.
 */

/**
 * ParticleRenderer — WebGL2, single canvas, zero DOM particles.
 *
 *   body pass (SDF sphere ⇄ ring, orbits, nodes, stars)  ─┐
 *   particle pass (point mesh, additive)                  ├─▶ HDR scene ─▶ bloom ─▶ tone-map
 *
 * Supports pure particles mode (only particles, no rim/body), all states,
 * and dynamic density tier switching.
 */

import { BLUR_FS, BODY_FS, COMPOSITE_FS, PARTICLE_FS, PARTICLE_VS, SCREEN_VS } from './gl/shaders';
import { dockLayout, stageLayout } from './layout';

export interface FrameParams {
  time: number;
  bodyScale: number;
  form: number; // 0 sphere … 1 ring
  body: number; // body opacity
  showBody: number; // 1 = full body/rim enabled, 0 = only particles
  onlyParticles: number; // 1 = only particles mode active
  level: number; // smoothed audio level 0..1
  inputAudio: number; // mic/input amplitude 0..1
  outputAudio: number; // speaker/output amplitude 0..1
  energy: number;
  think: number;
  speak: number;
  listen: number;
  render: number;
  idle: number;
  pause: number;
  completed: number;
  completedProgress: number;
  blocked: number;
  focusDir: [number, number];
  focusAmt: number;
  motion: number; // 1 full … 0 reduced
  orbitPhase: number;
  wavePhase: number;
  spin: number;
  arc: number;
  starT: number;
  morph: number; // 0 form … 1 target geometry
  gain: number; // particle brightness
  exposure: number;
  visualState: number;
  /* ---- background aurora only (never touches the shape) ---- */
  bgDeep: Vec3;
  bgCore: Vec3;
  bgAuraA: Vec3;
  bgAuraB: Vec3;
  bgAuraAmt: number;
  bgSpeed: number;
  bgPulse: number;
  bgPulseSpd: number;
  bgVig: number;
  bgLevel: number;
  /* ---- the shape only (never touches the background) ---- */
  shapeTint: Vec3;
  shapeTintAmt: number;
  shapeGlow: number;
  /* ---- cross-cutting states ---- */
  wake: number;
  wakeShockwave: number;
  paused: number;
  /** 0 = centre stage … 1 = docked mini-orb at bottom centre */
  dock: number;
  /** Idle/paused forward bow and subtle hanging translation. */
  bow: number;
  hang: [number, number];
  /* ---- user correction ---- */
  hue: number; // -1 cyan … +1 violet
  saturation: number; // 0 monochrome … 1 normal … 2 deep
  rimWidth: number;
  glow: number;
  orbits: number; // 0 hidden … 1 visible
  waveAmp: number;
  particleScale: number;
  sparkle: number;
  /* ---- ambient dust particles ---- */
  dustVisible: number; // 0 hidden, 1 visible
  dustSpeed: number;
  dustAmount: number;
}

export type Vec3 = [number, number, number];

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export class ParticleRenderer {
  readonly canvas: HTMLCanvasElement;
  particleCount: number;
  private gl: WebGL2RenderingContext;
  private failed = false;

  private bodyProg: WebGLProgram;
  private particleProg: WebGLProgram;
  private blurProg: WebGLProgram;
  private compProg: WebGLProgram;
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

  private particleVAO: WebGLVertexArrayObject = null as never;
  private targetBuf: WebGLBuffer = null as never;
  private seedBuf: WebGLBuffer = null as never;
  private densityTier: 'low' | 'medium' | 'high' = 'medium';

  private scene: Target | null = null;
  private halfA: Target | null = null;
  private halfB: Target | null = null;
  private quarterA: Target | null = null;
  private quarterB: Target | null = null;
  private floatOK = false;
  private dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('webgl2 unavailable');
    this.gl = gl;
    const cores = navigator.hardwareConcurrency || 4;
    const small = Math.min(innerWidth, innerHeight) < 560;
    this.densityTier = cores <= 4 || small ? 'low' : 'medium';
    this.particleCount = this.countForTier(this.densityTier);
    this.floatOK = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));

    this.bodyProg = this.program(SCREEN_VS, BODY_FS);
    this.particleProg = this.program(PARTICLE_VS, PARTICLE_FS);
    this.blurProg = this.program(SCREEN_VS, BLUR_FS);
    this.compProg = this.program(SCREEN_VS, COMPOSITE_FS);

    this.createParticleGeometry();
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
  }

  /* ------------------------------ setup ------------------------------ */

  private shader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh) ?? '';
      gl.deleteShader(sh);
      throw new Error('shader compile: ' + info);
    }
    return sh;
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    this.uniforms.set(p, new Map());
    return p;
  }

  private u(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    const cache = this.uniforms.get(p)!;
    if (!cache.has(name)) cache.set(name, this.gl.getUniformLocation(p, name));
    return cache.get(name)!;
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.floatOK) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && this.floatOK) {
      this.floatOK = false;
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      return this.makeTarget(w, h);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }

  private destroyTarget(t: Target | null) {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  private countForTier(tier: 'low' | 'medium' | 'high'): number {
    // Low still has enough points for the idle bow ribbon to read as a continuous arc.
    if (tier === 'low') return 4200;
    if (tier === 'high') return 10800;
    const cores = navigator.hardwareConcurrency || 4;
    return cores <= 4 || Math.min(innerWidth, innerHeight) < 560 ? 4800 : 7200;
  }

  /** Rebuild the point mesh at a different density. */
  setDensity(tier: 'low' | 'medium' | 'high') {
    if (tier === this.densityTier && this.particleVAO) return;
    const gl = this.gl;
    if (this.particleVAO) gl.deleteVertexArray(this.particleVAO);
    if (this.seedBuf) gl.deleteBuffer(this.seedBuf);
    if (this.targetBuf) gl.deleteBuffer(this.targetBuf);
    this.densityTier = tier;
    this.particleCount = this.countForTier(tier);
    this.createParticleGeometry();
  }

  private createParticleGeometry() {
    const gl = this.gl;
    const n = this.particleCount;
    const seeds = new Float32Array(n * 4);
    const g = 1.324717957244746; // plastic constant
    const a1 = 1 / g;
    const a2 = 1 / (g * g);
    let s = 0x9e3779b9;
    const rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
    for (let i = 0; i < n; i++) {
      seeds[i * 4] = (0.5 + a1 * (i + 1)) % 1;
      seeds[i * 4 + 1] = (0.5 + a2 * (i + 1)) % 1;
      seeds[i * 4 + 2] = rnd();
      seeds[i * 4 + 3] = rnd();
    }
    const targets = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const th = seeds[i * 4] * Math.PI * 2;
      targets[i * 2] = Math.cos(th);
      targets[i * 2 + 1] = Math.sin(th);
    }

    this.particleVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.particleVAO);
    this.seedBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    this.targetBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.targetBuf);
    gl.bufferData(gl.ARRAY_BUFFER, targets, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Generated geometry in (object space ±1, y up); length = particleCount*2. */
  uploadTargets(points: Float32Array) {
    if (this.failed || !this.targetBuf) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.targetBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, points.subarray(0, this.particleCount * 2));
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private resizeIfNeeded() {
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (w === this.canvas.width && h === this.canvas.height && this.scene) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.destroyTarget(this.scene);
    this.destroyTarget(this.halfA);
    this.destroyTarget(this.halfB);
    this.destroyTarget(this.quarterA);
    this.destroyTarget(this.quarterB);
    this.scene = this.makeTarget(w, h);
    const hw = Math.max(1, w >> 1);
    const hh = Math.max(1, h >> 1);
    const qw = Math.max(1, w >> 2);
    const qh = Math.max(1, h >> 2);
    this.halfA = this.makeTarget(hw, hh);
    this.halfB = this.makeTarget(hw, hh);
    this.quarterA = this.makeTarget(qw, qh);
    this.quarterB = this.makeTarget(qw, qh);
  }

  /* ------------------------------ frame ------------------------------ */

  frame(p: FrameParams) {
    if (this.failed) return;
    try {
      this.render(p);
    } catch (err) {
      this.failed = true;
      console.warn('[sophia] renderer stopped:', err);
    }
  }

  private render(p: FrameParams) {
    const gl = this.gl;
    this.resizeIfNeeded();
    if (!this.scene || !this.halfA || !this.halfB || !this.quarterA || !this.quarterB) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    /* dock travel: fade out at centre (0→0.5), reappear at the bottom dock (0.5→1) */
    const dockT = Math.min(1, Math.max(0, p.dock));
    const half = dockT < 0.5;
    const rawVis = half ? 1 - dockT * 2 : (dockT - 0.5) * 2;
    const vis = rawVis * rawVis * (3 - 2 * rawVis); // smoothstep the fade
    const lay = half
      ? stageLayout(this.canvas.clientWidth, this.canvas.clientHeight)
      : dockLayout(this.canvas.clientWidth, this.canvas.clientHeight);
    const cx = lay.cx * this.dpr;
    const cy = (this.canvas.clientHeight - lay.cy) * this.dpr; // GL y-up
    const R = lay.R * this.dpr;

    /* scene: body pass (SDF) */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    const b = this.bodyProg;
    gl.useProgram(b);
    gl.uniform2f(this.u(b, 'uVP'), W, H);
    gl.uniform2f(this.u(b, 'uCenter'), cx, cy);
    gl.uniform1f(this.u(b, 'uR'), R);
    gl.uniform1f(this.u(b, 'uDpr'), this.dpr);
    gl.uniform1f(this.u(b, 'uAspect'), W / H);
    gl.uniform1f(this.u(b, 'uTime'), p.time);
    gl.uniform1f(this.u(b, 'uForm'), p.form);
    gl.uniform1f(this.u(b, 'uBody'), p.body * vis);
    gl.uniform1f(this.u(b, 'uShowBody'), p.showBody);
    gl.uniform1f(this.u(b, 'uBodyScale'), p.bodyScale);
    gl.uniform1f(this.u(b, 'uLevel'), p.level);
    gl.uniform1f(this.u(b, 'uEnergy'), p.energy);
    gl.uniform1f(this.u(b, 'uThink'), p.think);
    gl.uniform1f(this.u(b, 'uSpeak'), p.speak);
    gl.uniform1f(this.u(b, 'uListen'), p.listen);
    gl.uniform1f(this.u(b, 'uRender'), p.render);
    gl.uniform1f(this.u(b, 'uIdle'), p.idle);
    gl.uniform1f(this.u(b, 'uPause'), p.pause);
    gl.uniform1f(this.u(b, 'uCompleted'), p.completed);
    gl.uniform1f(this.u(b, 'uCompletedProgress'), p.completedProgress);
    gl.uniform1f(this.u(b, 'uBlocked'), p.blocked);
    gl.uniform1f(this.u(b, 'uInputAudio'), p.inputAudio);
    gl.uniform1f(this.u(b, 'uOutputAudio'), p.outputAudio);
    gl.uniform2f(this.u(b, 'uFocusDir'), p.focusDir[0], p.focusDir[1]);
    gl.uniform1f(this.u(b, 'uFocusAmt'), p.focusAmt);
    gl.uniform1f(this.u(b, 'uMotion'), p.motion);
    gl.uniform1f(this.u(b, 'uOrbitPhase'), p.orbitPhase);
    gl.uniform1f(this.u(b, 'uWavePhase'), p.wavePhase);
    gl.uniform1f(this.u(b, 'uArc'), p.arc);
    gl.uniform1f(this.u(b, 'uStarT'), p.starT);
    gl.uniform1f(this.u(b, 'uRimWidth'), p.rimWidth);
    gl.uniform1f(this.u(b, 'uGlow'), p.glow);
    gl.uniform1f(this.u(b, 'uOrbits'), p.orbits * vis * (1 - dockT * 0.65));
    gl.uniform1f(this.u(b, 'uWaveAmp'), p.waveAmp);
    gl.uniform1f(this.u(b, 'uHue'), p.hue);
    gl.uniform1f(this.u(b, 'uSaturation'), p.saturation);
    gl.uniform1f(this.u(b, 'uVisualState'), p.visualState);
    /* atmosphere — background only */
    gl.uniform3f(this.u(b, 'uBgDeep'), p.bgDeep[0], p.bgDeep[1], p.bgDeep[2]);
    gl.uniform3f(this.u(b, 'uBgCore'), p.bgCore[0], p.bgCore[1], p.bgCore[2]);
    gl.uniform3f(this.u(b, 'uBgAuraA'), p.bgAuraA[0], p.bgAuraA[1], p.bgAuraA[2]);
    gl.uniform3f(this.u(b, 'uBgAuraB'), p.bgAuraB[0], p.bgAuraB[1], p.bgAuraB[2]);
    gl.uniform1f(this.u(b, 'uBgAuraAmt'), p.bgAuraAmt);
    gl.uniform1f(this.u(b, 'uBgSpeed'), p.bgSpeed);
    gl.uniform1f(this.u(b, 'uBgPulse'), p.bgPulse);
    gl.uniform1f(this.u(b, 'uBgPulseSpd'), p.bgPulseSpd);
    gl.uniform1f(this.u(b, 'uBgVig'), p.bgVig);
    gl.uniform1f(this.u(b, 'uBgLevel'), p.bgLevel);
    /* shape colour + glow */
    gl.uniform3f(this.u(b, 'uShapeTint'), p.shapeTint[0], p.shapeTint[1], p.shapeTint[2]);
    gl.uniform1f(this.u(b, 'uShapeTintAmt'), p.shapeTintAmt);
    gl.uniform1f(this.u(b, 'uShapeGlow'), p.shapeGlow);
    /* wake + pause + dock */
    gl.uniform1f(this.u(b, 'uWake'), p.wake);
    gl.uniform1f(this.u(b, 'uWakeShock'), p.wakeShockwave);
    gl.uniform1f(this.u(b, 'uPaused'), p.paused);
    gl.uniform1f(this.u(b, 'uDock'), p.dock);
    gl.uniform1f(this.u(b, 'uBow'), p.bow);
    gl.uniform2f(this.u(b, 'uHang'), p.hang[0], p.hang[1]);
    /* dust particles */
    gl.uniform1f(this.u(b, 'uDustVisible'), p.dustVisible);
    gl.uniform1f(this.u(b, 'uDustSpeed'), p.dustSpeed);
    gl.uniform1f(this.u(b, 'uDustAmount'), p.dustAmount);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* scene: particle mesh pass (additive) */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const q = this.particleProg;
    gl.useProgram(q);
    gl.uniform2f(this.u(q, 'uVP'), W, H);
    gl.uniform2f(this.u(q, 'uCenter'), cx, cy);
    gl.uniform1f(this.u(q, 'uR'), R);
    gl.uniform1f(this.u(q, 'uDpr'), this.dpr);
    gl.uniform1f(this.u(q, 'uAspect'), W / H);
    gl.uniform1f(this.u(q, 'uTime'), p.time);
    gl.uniform1f(this.u(q, 'uForm'), p.form);
    gl.uniform1f(this.u(q, 'uMorph'), p.morph);
    gl.uniform1f(this.u(q, 'uSpin'), p.spin);
    gl.uniform1f(this.u(q, 'uLevel'), p.level);
    gl.uniform1f(this.u(q, 'uMotion'), p.motion);
    gl.uniform1f(this.u(q, 'uGain'), p.gain * vis);
    gl.uniform1f(this.u(q, 'uBodyScale'), p.bodyScale);
    gl.uniform1f(this.u(q, 'uHue'), p.hue);
    gl.uniform1f(this.u(q, 'uSaturation'), p.saturation);
    gl.uniform1f(this.u(q, 'uThink'), p.think);
    gl.uniform1f(this.u(q, 'uSpeak'), p.speak);
    gl.uniform1f(this.u(q, 'uListen'), p.listen);
    gl.uniform1f(this.u(q, 'uRender'), p.render);
    gl.uniform1f(this.u(q, 'uIdle'), p.idle);
    gl.uniform1f(this.u(q, 'uPause'), p.pause);
    gl.uniform1f(this.u(q, 'uCompleted'), p.completed);
    gl.uniform1f(this.u(q, 'uCompletedProgress'), p.completedProgress);
    gl.uniform1f(this.u(q, 'uBlocked'), p.blocked);
    gl.uniform1f(this.u(q, 'uInputAudio'), p.inputAudio);
    gl.uniform1f(this.u(q, 'uOutputAudio'), p.outputAudio);
    gl.uniform1f(this.u(q, 'uOnlyParticles'), p.onlyParticles);
    gl.uniform1f(this.u(q, 'uParticleScale'), p.particleScale);
    gl.uniform1f(this.u(q, 'uSparkle'), p.sparkle);
    gl.uniform1f(this.u(q, 'uVisualState'), p.visualState);
    gl.uniform3f(this.u(q, 'uShapeTint'), p.shapeTint[0], p.shapeTint[1], p.shapeTint[2]);
    gl.uniform1f(this.u(q, 'uShapeTintAmt'), p.shapeTintAmt);
    gl.uniform1f(this.u(q, 'uShapeGlow'), p.shapeGlow);
    gl.uniform1f(this.u(q, 'uWake'), p.wake);
    gl.uniform1f(this.u(q, 'uWakeShock'), p.wakeShockwave);
    gl.uniform1f(this.u(q, 'uPaused'), p.paused);
    gl.uniform1f(this.u(q, 'uDock'), p.dock);
    gl.uniform1f(this.u(q, 'uBow'), p.bow);
    gl.uniform2f(this.u(q, 'uHang'), p.hang[0], p.hang[1]);
    gl.bindVertexArray(this.particleVAO);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);

    /* bloom */
    const blur = (src: WebGLTexture, dst: Target, dx: number, dy: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.useProgram(this.blurProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(this.u(this.blurProg, 'uTex'), 0);
      gl.uniform2f(this.u(this.blurProg, 'uDir'), dx, dy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const hA = this.halfA;
    const hB = this.halfB;
    const qA = this.quarterA;
    const qB = this.quarterB;
    blur(this.scene.tex, hB, 1 / hA.w, 0);
    blur(hB.tex, hA, 0, 1 / hA.h);
    blur(hA.tex, hB, 1 / hA.w, 0);
    blur(hB.tex, hA, 0, 1 / hA.h);
    blur(hA.tex, qB, 1 / qA.w, 0);
    blur(qB.tex, qA, 0, 1 / qA.h);
    blur(qA.tex, qB, 1.4 / qA.w, 0);
    blur(qB.tex, qA, 0, 1.4 / qA.h);

    /* composite */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(this.u(this.compProg, 'uScene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, hA.tex);
    gl.uniform1i(this.u(this.compProg, 'uB1'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, qA.tex);
    gl.uniform1i(this.u(this.compProg, 'uB2'), 2);
    gl.uniform1f(this.u(this.compProg, 'uExposure'), p.exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    this.failed = true;
    const gl = this.gl;
    this.destroyTarget(this.scene);
    this.destroyTarget(this.halfA);
    this.destroyTarget(this.halfB);
    this.destroyTarget(this.quarterA);
    this.destroyTarget(this.quarterB);
    if (this.particleVAO) gl.deleteVertexArray(this.particleVAO);
    if (this.targetBuf) gl.deleteBuffer(this.targetBuf);
    if (this.seedBuf) gl.deleteBuffer(this.seedBuf);
    for (const prog of this.uniforms.keys()) gl.deleteProgram(prog);
    this.uniforms.clear();
  }
}
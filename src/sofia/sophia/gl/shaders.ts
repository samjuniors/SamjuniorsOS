/**
 * Sophia GPU programs.
 *
 * BODY_FS     — fullscreen signed-distance pass. Two strictly separated layers:
 *               (1) ATMOSPHERE  — slow drifting aurora/aura gradient, tinted and
 *                   animated per state. This is the only thing the background does.
 *               (2) THE BODY    — sphere ⇄ ring rim, membrane waves, specular, pool.
 *                   Its colour + glow are tinted per state. Invisible in
 *                   "just particles" mode (uShowBody = 0).
 * PARTICLE_VS — the computational point mesh: all shapes, all states, wake-up
 *               convergence, pause freeze, per-state colour + glow.
 * BLUR / COMPOSITE — HDR bloom + filmic tone-map (controlled, not neon).
 */

export const SCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2));
  vUv = p;
  gl_Position = vec4(p*2.0-1.0, 0.0, 1.0);
}
`;

/** Shared: hue palette + cheap value-noise fbm for the aura. */
const COMMON = `
const float TAU = 6.28318530718;
uniform float uHue;
uniform float uSaturation;
float gauss(float x, float s){ return exp(-x*x/(2.0*s*s)); }
float angDiff(float a, float b){ float d = a - b; return abs(mod(d + 3.14159265, TAU) - 3.14159265); }
vec3 adjustSat(vec3 color, float sat){
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luma), color, sat);
}
vec3 rimColor(float ang){
  // Harmonious celestial palette: electric cyan → sapphire → soft astral violet → celestial mint
  vec3 c = vec3(0.18, 0.58, 1.0);
  float vw = clamp(0.95 + uHue * 0.85, 0.0, 2.0);
  float cw = clamp(0.90 - uHue * 0.60, 0.0, 1.5);
  c = mix(c, vec3(0.28, 0.94, 0.82), gauss(angDiff(ang, 0.20), 0.70) * 0.75); // celestial mint
  c = mix(c, vec3(0.78, 0.46, 0.98), gauss(angDiff(ang, 1.35), 0.75) * 0.75 * vw); // soft astral violet
  c = mix(c, vec3(0.48, 0.42, 1.00), gauss(angDiff(ang, 2.45), 0.80) * 0.80); // deep sapphire violet
  c = mix(c, vec3(0.22, 0.88, 1.00), gauss(angDiff(ang, 3.85), 0.75) * 0.85 * cw); // electric cyan
  c = mix(c, vec3(0.65, 0.60, 1.00), gauss(angDiff(ang, 5.25), 0.70) * 0.60); // luminous pearl
  c = adjustSat(c, uSaturation);
  return max(c, vec3(0.02, 0.05, 0.12));
}
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0 - 2.0*f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c) * p; }
`;

/**
 * ATMOSPHERE — ultra-soft, silky, ethereal aura gradient.
 * Zero harsh noise grain or banding. Uses smooth multi-pole Gaussian
 * ethereal drift and gentle harmonic breathing so the aura feels
 * velvety, atmospheric, and deeply calming.
 */
const ATMOSPHERE = `
uniform float uAspect;
uniform float uTime;
uniform vec3  uBgDeep;      // deepest vignette navy
uniform vec3  uBgCore;      // near-centre field colour
uniform vec3  uBgAuraA;     // drifting mist colour 1
uniform vec3  uBgAuraB;     // drifting mist colour 2
uniform float uBgAuraAmt;   // mist strength 0..1
uniform float uBgSpeed;     // drift speed multiplier
uniform float uBgPulse;     // breathing strength 0..0.4
uniform float uBgPulseSpd;  // breathing rate
uniform float uBgVig;       // vignette strength
uniform float uBgLevel;     // live audio reactivity 0..1
uniform float uWake;        // 0..1 wake-up expansion (background side)
uniform float uWakeShock;   // 0..1 shockwave ring intensity
uniform float uPaused;      // 0..1 freeze + desaturate
uniform float uMotion;
/* dust particles */
uniform float uDustVisible;
uniform float uDustSpeed;
uniform float uDustAmount;
vec3 atmosphere(vec2 q, float vq){
  float t = uTime * uBgSpeed * uMotion * 0.42;

  // 3 smooth wandering Gaussian aura poles that drift like silk ribbons
  vec2 p1 = vec2(sin(t * 0.65) * 0.42, cos(t * 0.52) * 0.32);
  vec2 p2 = vec2(cos(t * 0.44 + 2.1) * 0.52, sin(t * 0.58 + 1.2) * 0.38);
  vec2 p3 = vec2(sin(t * 0.32 + 4.3) * 0.28, cos(t * 0.38 + 3.1) * 0.44);

  // Broad, velvety Gaussian falloffs - completely smooth and buttery
  float a1 = exp(-dot(q - p1, q - p1) * 1.6);
  float a2 = exp(-dot(q - p2, q - p2) * 1.3);
  float a3 = exp(-dot(q - p3, q - p3) * 2.0);
  float centerHalo = exp(-dot(q, q) * 1.8);

  // Micro organic harmonic drift - zero pixelation
  float wave = 0.06 * sin(q.x * 2.2 + sin(q.y * 1.8 + t * 0.7) + t * 0.6);
  a1 = clamp(a1 + wave * a1, 0.0, 1.0);
  a2 = clamp(a2 - wave * a2, 0.0, 1.0);

  // Velvety deep backdrop
  vec3 col = mix(uBgDeep, uBgCore, 1.0 - smoothstep(0.0, 1.35, vq));

  // Blend in the luminous soft aura ribbons
  col += uBgAuraA * a1 * uBgAuraAmt * 0.27;
  col += uBgAuraB * a2 * uBgAuraAmt * 0.23;
  col += mix(uBgAuraA, uBgAuraB, 0.5) * a3 * uBgAuraAmt * 0.15;

  // Soft breathing central aura swell + audio lift
  float breath = 0.5 + 0.5 * sin(uTime * uBgPulseSpd * uMotion);
  col += (uBgAuraA * 0.58 + uBgAuraB * 0.42) * (uBgPulse * breath * 0.62 + uBgLevel * 0.10) * centerHalo;

  // ================= GALAXY & PIXIE DUST (Multi-scale celestial particles) =================
  if (uDustVisible > 0.001 && uDustAmount > 0.001) {
    float dustSpeedFactor = uDustSpeed * 0.14;
    float dustT = uTime * dustSpeedFactor;
    vec2 baseUv = q * vec2(uAspect, 1.0) + 0.5;

    // --- LAYER 1: Floating Volumetric Pixie Dust (varied sizes, luminous halos, gem colors) ---
    float pixieCellSize = mix(44.0, 30.0, min(uDustAmount, 1.0));
    vec2 pixieUv = baseUv * pixieCellSize;
    pixieUv += vec2(dustT * 0.45, dustT * 0.28 + sin(uTime * 0.35 + q.x * 2.2) * 0.16);
    vec2 pCell = floor(pixieUv);
    vec2 pFrac = fract(pixieUv) - 0.5;
    float ph1 = hash21(pCell);
    float ph2 = hash21(pCell + 43.17);
    float ph3 = hash21(pCell + 97.43);

    if (ph1 < 0.44 * min(uDustAmount * 1.15, 1.25)) {
      vec2 pOffset = vec2(ph2 - 0.5, ph3 - 0.5) * 0.72;
      vec2 dVec = pFrac - pOffset;
      float pDist = length(dVec);

      // Huge size variation: tiny pixie specks (0.015) to prominent luminous motes (0.065)
      float pSize = mix(0.016, 0.064, ph2 * ph2);

      // Rich diverse celestial color palette: cyan, lavender/amethyst, champagne gold, rose quartz, diamond white
      vec3 pColor;
      if (ph3 < 0.26) {
        pColor = vec3(0.38, 0.88, 1.0);   // Celestial Cyan
      } else if (ph3 < 0.52) {
        pColor = vec3(0.74, 0.56, 1.0);   // Amethyst / Lavender
      } else if (ph3 < 0.76) {
        pColor = vec3(1.0, 0.86, 0.54);   // Cosmic Champagne Gold
      } else if (ph3 < 0.90) {
        pColor = vec3(0.98, 0.62, 0.82);   // Rose Nebula Quartz
      } else {
        pColor = vec3(0.88, 0.96, 1.0);   // Diamond Star-White
      }

      // Dual-kernel glow: concentrated bright core + wide soft ethereal aureole
      float coreGlow = exp(-pDist * pDist / (pSize * pSize * 0.28));
      float auraGlow = exp(-pDist * pDist / (pSize * pSize * 2.5)) * 0.52;
      float pixieGlow = coreGlow + auraGlow;

      // Subtle diamond star sparkle for larger radiant gems
      if (ph2 > 0.70) {
        float glintX = max(0.0, 1.0 - abs(dVec.x) / (pSize * 1.7)) * max(0.0, 1.0 - abs(dVec.y) / (pSize * 0.42));
        float glintY = max(0.0, 1.0 - abs(dVec.y) / (pSize * 1.7)) * max(0.0, 1.0 - abs(dVec.x) / (pSize * 0.42));
        pixieGlow += (glintX + glintY) * 0.35;
      }

      // Varied twinkle rate: some slow breathing, some rapid shimmering pixie dust
      float twinkleRate = mix(1.2, 5.2, ph3);
      float twinkle = 0.55 + 0.45 * sin(uTime * twinkleRate + ph1 * 62.8);

      // Soft vignette fade toward deep screen edges
      float fade = smoothstep(1.35, 0.75, vq) * 0.85;
      col += pColor * pixieGlow * twinkle * fade * uDustVisible * 0.65;
    }

    // --- LAYER 2: Fine Cosmic Nebula Stardust (dense micro glittering pinpricks) ---
    float microCellSize = mix(82.0, 64.0, min(uDustAmount, 1.0));
    vec2 microUv = baseUv * microCellSize + vec2(-dustT * 0.32, dustT * 0.22);
    vec2 mCell = floor(microUv);
    vec2 mFrac = fract(microUv) - 0.5;
    float mh1 = hash21(mCell);
    float mh2 = hash21(mCell + 61.2);
    if (mh1 < 0.38 * min(uDustAmount, 1.0)) {
      vec2 mOffset = vec2(mh2 - 0.5, hash21(mCell + 19.4) - 0.5) * 0.75;
      float mDist = length(mFrac - mOffset);
      float mSize = 0.010 + mh2 * 0.014;
      float mDot = exp(-mDist * mDist / (mSize * mSize * 0.52));
      float mTwinkle = 0.5 + 0.5 * sin(uTime * (2.2 + mh2 * 4.0) + mh1 * 40.0);
      vec3 mColor = mix(vec3(0.50, 0.75, 1.0), vec3(0.85, 0.70, 1.0), mh2);
      col += mColor * mDot * mTwinkle * smoothstep(1.4, 0.6, vq) * uDustVisible * 0.32;
    }
  }

  // Vignette: gentle and soft
  col *= 1.0 - uBgVig * smoothstep(0.35, 1.45, vq) * 0.58;

  // Pause atmosphere: serene desaturation to deep midnight monochrome
  if (uPaused > 0.01) {
    float bgLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(bgLuma * 0.75), uPaused * 0.88);
  }

  // High-precision dithering — breaks up any subtle gradient banding
  float ignAtm = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  col += vec3((ignAtm - 0.5) * (1.2 / 255.0));

  return col;
}
`;

export const BODY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uVP;
uniform vec2 uCenter;
uniform float uR;
uniform float uDpr;
uniform float uForm;
uniform float uBody;
uniform float uShowBody;
uniform float uBodyScale;
uniform float uLevel;
uniform float uEnergy;
uniform float uThink;
uniform float uSpeak;
uniform float uListen;
uniform float uRender;
uniform float uIdle;
uniform float uPause;
uniform float uCompleted;
uniform float uCompletedProgress;
uniform float uBlocked;
uniform float uInputAudio;
uniform float uOutputAudio;
uniform vec2 uFocusDir;
uniform float uFocusAmt;
uniform float uOrbitPhase;
uniform float uWavePhase;
uniform float uArc;
uniform float uStarT;
uniform float uRimWidth;
uniform float uGlow;
uniform float uOrbits;
uniform float uWaveAmp;
uniform float uDock;
uniform float uBow;
uniform vec2  uHang;
// ---- per-state shape colour + glow (the body only) ----
uniform vec3  uShapeTint;
uniform float uShapeTintAmt;
uniform float uShapeGlow;
out vec4 frag;
${COMMON}
${ATMOSPHERE}
float rimLight(float ang, float focusAng){
  float l = 0.65 + 0.35 * max(gauss(angDiff(ang, 0.80), 0.95), gauss(angDiff(ang, 3.75), 1.15));
  l += uFocusAmt * 0.38 * gauss(angDiff(ang, focusAng), 0.85);
  l += uThink * 0.65 * gauss(angDiff(ang, uArc), 0.45);
  l += uRender * 0.45 * gauss(angDiff(ang, mod(uTime * 4.0, TAU)), 0.35);
  return l;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - uCenter) / uR - uHang;
  float aspect = uVP.x / uVP.y;
  vec2 q = (vUv - vec2(0.5, 0.52)) * vec2(uAspect, 1.0);
  float vq = length(q);

  /* ============ LAYER 1 : ATMOSPHERE (background only) ============ */
  vec3 col = atmosphere(q, vq);

  /* ============ LAYER 2 : THE BODY (hidden in "just particles") ============ */
  if (uShowBody <= 0.001) {
    frag = vec4(col, 1.0);
    return;
  }

  float dS = length(p);

  // Ethereal celestial resonance halo when orbits enabled (whisper-thin, elegant light resonance)
  if (uOrbits > 0.01) {
    float haloDist = abs(dS - 1.22);
    float haloThin = exp(-haloDist * haloDist / (2.0 * 0.0045 * 0.0045));
    float haloSoft = exp(-haloDist / 0.075);
    vec3 orbCol = mix(vec3(0.38, 0.72, 1.0), uShapeTint, uShapeTintAmt * 0.75);
    col += orbCol * (haloThin * 0.38 + haloSoft * 0.10) * uOrbits * uShapeGlow;
  }

  // ---- sphere ⇄ ring body geometry ----
  vec2 pb = p;
  pb.y += 0.14 * uBow;
  pb.y /= mix(1.0, 0.68, uBow);
  pb.x /= mix(1.0, 0.94, uBow);
  pb.y -= pow(abs(pb.x), 1.55) * 0.18 * uBow;
  pb /= uBodyScale;
  float ang = atan(pb.y, pb.x);
  float wob = 1.0 + uMotion * (0.006*sin(ang*3.0 + uWavePhase*0.9) + 0.004*sin(ang*5.0 - uWavePhase*0.6)) * (1.0 + 2.0*uLevel*uSpeak);
  // Serene undulating harmonic surface wave
  wob += (0.007 * sin(ang * 4.0 + uTime * 0.8) + 0.004 * cos(ang * 2.0 - uTime * 0.6)) * uIdle * uMotion;
  float d = length(pb) / wob;
  float e = d - 1.0;
  float focusAng = atan(uFocusDir.y, uFocusDir.x);

  // State-tinted body & rim colour
  vec3 rc = mix(rimColor(ang), uShapeTint, uShapeTintAmt);
  float li = rimLight(ang, focusAng);

  // ================= SILK-SMOOTH LUMINOUS FRESNEL RIM =================
  float sBand = mix(0.018, 0.013, uForm) * uRimWidth * mix(1.0, 1.25, uDock);
  float sCore = mix(0.0068, 0.0050, uForm) * uRimWidth * mix(1.0, 1.15, uDock);
  float band = gauss(e, sBand);
  float core = gauss(e, sCore);
  float outerBloom = exp(-max(e, 0.0) / (mix(0.075, 0.050, uForm) * mix(1.0, 0.75, uDock))) * step(0.0, e);
  float innerFresnel = pow(smoothstep(0.35, 0.995, d), 3.2) * (1.0 - smoothstep(0.995, 1.015, d));
  float gain = mix(1.0, 1.26, uForm) * (0.94 + 0.06*uEnergy + 0.2*uLevel) * uGlow * uShapeGlow * mix(1.0, 1.15, uDock);

  // Unified optical rim composition: smooth core + radiant bloom + internal Fresnel reflection
  vec3 rim = rc * (band * 1.35 + core * 0.85 + outerBloom * 0.42 + innerFresnel * 0.50) * li * gain;
  rim += mix(vec3(0.94, 0.98, 1.0), uShapeTint * 1.20, uShapeTintAmt * 0.5) * core * 0.45 * li * gain;

  // ================= CRYSTAL VOLUMETRIC BODY CORE =================
  float inside = 1.0 - smoothstep(0.982, 1.0, d);
  float radialDepth = exp(-d * d * 2.2) * inside;
  // Deep ethereal crystal interior: illuminates the 3D volume without muddying the particle ribbons
  vec3 interior = mix(vec3(0.03, 0.10, 0.26), uShapeTint * 0.35, uShapeTintAmt) * radialDepth;
  interior *= (0.35 + 0.25 * uEnergy + 0.25 * uLevel) * (1.0 - uForm);

  // Soft crystalline specular refraction
  vec2 restL = normalize(vec2(-0.55, 0.70));
  vec2 lightDir = normalize(mix(restL, uFocusDir, uFocusAmt * 0.55));
  vec2 hpos = lightDir * 0.55;
  float spec = exp(-dot(pb - hpos, pb - hpos) / (2.0 * 0.16 * 0.16)) * inside;
  float crescent = gauss(d - 0.915, 0.040) * pow(max(0.0, dot(normalize(pb + vec2(1e-4, 0.0)), lightDir)), 2.2) * inside;
  vec3 light = (mix(vec3(0.68, 0.86, 1.0), uShapeTint, uShapeTintAmt * 0.5) * spec * 0.22
             +  mix(vec3(0.62, 0.84, 1.0), uShapeTint, uShapeTintAmt * 0.5) * crescent * 0.26) * (1.0 - uForm);

  // ================= ORGANIC 8-STATE SHADER EXTENSIONS =================
  // 1. LISTENING — Luminous voice-reactive edge breathing
  if (uListen > 0.01) {
    float listenAudio = 0.35 + 0.65 * uInputAudio;
    float listenPulse = (band + innerFresnel) * listenAudio * uListen;
    rim += vec3(0.35, 0.88, 1.0) * listenPulse * 1.15;
    interior += vec3(0.18, 0.62, 0.95) * radialDepth * listenAudio * uListen * 0.50;
  }

  // 2. THINKING — Ethereal rotating prism refraction in core
  if (uThink > 0.01) {
    float thinkRot = ang + uTime * 0.75;
    float prism = sin(thinkRot * 3.0) * 0.5 + 0.5;
    vec3 thinkCol = mix(vec3(0.55, 0.45, 1.0), vec3(0.35, 0.75, 1.0), prism);
    rim += thinkCol * core * 0.75 * uThink;
    interior += thinkCol * radialDepth * (0.50 + 0.50 * sin(uTime * 2.2)) * uThink * 0.70 * (1.0 - uForm);
  }

  // 3. RENDERING — Smooth constructive scan passes
  if (uRender > 0.01) {
    float scanY = mod(uTime * 0.9, 2.4) - 1.2;
    float scanPass = gauss(pb.y - scanY, 0.065) * 1.6;
    rim += vec3(0.32, 1.0, 0.88) * scanPass * uRender * 1.2;
    interior += vec3(0.22, 0.92, 0.78) * scanPass * radialDepth * uRender * 0.55 * (1.0 - uForm);
  }

  // 4. SPEAKING — Outward harmonic acoustic pulse ripples
  if (uSpeak > 0.01) {
    float acoustic = (sin(d * 14.0 - uTime * 11.0) * 0.5 + 0.5) * (0.32 + 0.68 * uOutputAudio) * uSpeak;
    vec3 speakCol = mix(vec3(0.35, 0.78, 1.0), vec3(0.78, 0.45, 1.0), 0.35);
    rim += speakCol * (innerFresnel + band) * acoustic * 0.88;
    interior += speakCol * radialDepth * (0.35 + 0.65 * uOutputAudio) * uSpeak * 0.60 * (1.0 - uForm);
  }

  // 5. PAUSE — Tranquil dimming
  if (uPause > 0.01) {
    rim *= mix(1.0, 0.68, uPause);
    interior *= mix(1.0, 0.48, uPause);
  }

  // 6. COMPLETED — Emerald aurora convergence
  if (uCompleted > 0.01) {
    float greenFlash = smoothstep(0.20, 0.42, uCompletedProgress) * (1.0 - smoothstep(0.65, 0.92, uCompletedProgress)) * uCompleted;
    vec3 greenCol = vec3(0.25, 0.98, 0.55);
    rim = mix(rim, greenCol * (band * 1.8 + core * 1.4), greenFlash * 0.90);
    interior += greenCol * radialDepth * greenFlash * 0.70 * (1.0 - uForm);
  }

  // 7. BLOCKED — Restrained crimson tension
  if (uBlocked > 0.01) {
    vec3 roseCol = vec3(0.95, 0.28, 0.38);
    float resistPulse = 1.0 + 0.08 * sin(uTime * 10.0) * uBlocked;
    rim = mix(rim * resistPulse, roseCol * (band * 1.5 + core * 1.2), uBlocked * 0.65);
    interior += roseCol * radialDepth * 0.32 * uBlocked * (1.0 - uForm);
  }

  // Final shape color: cohesive luminous glass rim + glowing volumetric core + crystal light
  vec3 shapeCol = (rim + interior + light) * uBody;
  shapeCol = adjustSat(shapeCol, uSaturation);
  if (uPaused > 0.01) {
    float sLuma = dot(shapeCol, vec3(0.2126, 0.7152, 0.0722));
    shapeCol = mix(shapeCol, vec3(sLuma * 0.82), uPaused * 0.90);
  }
  col += shapeCol;

  // Pause atmosphere desaturation
  if (uPaused > 0.01) {
    float cLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(cLuma * 0.82), uPaused * 0.90);
  }

  frag = vec4(col, 1.0);
}
`;

export const PARTICLE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
layout(location=1) in vec2 aTarget;
uniform vec2 uVP;
uniform vec2 uCenter;
uniform float uR;
uniform float uDpr;
uniform float uAspect;
uniform float uTime;
uniform float uForm;
uniform float uMorph;
uniform float uSpin;
uniform float uLevel;
uniform float uMotion;
uniform float uGain;
uniform float uBodyScale;
uniform float uThink;
uniform float uSpeak;
uniform float uListen;
uniform float uRender;
uniform float uOnlyParticles;
uniform float uParticleScale;
uniform float uSparkle;
uniform float uVisualState;
uniform float uDock;
uniform float uBow;
uniform vec2  uHang;
uniform float uIdle;
uniform float uPause;
uniform float uCompleted;
uniform float uCompletedProgress;
uniform float uBlocked;
uniform float uInputAudio;
uniform float uOutputAudio;
uniform vec3  uShapeTint;
uniform float uShapeTintAmt;
uniform float uShapeGlow;
uniform float uWake;
uniform float uWakeShock;
uniform float uPaused;
out vec4 vCol;
${COMMON}
void main(){
  float u = aSeed.x, v = aSeed.y;
  float lon = u*TAU + uSpin;
  float y0 = 1.0 - 2.0*v;
  float rxy = sqrt(max(0.0, 1.0 - y0*y0));
  vec3 s = vec3(cos(lon)*rxy, y0, sin(lon)*rxy);
  float ct = cos(0.35), st = sin(0.35);
  s = vec3(s.x, s.y*ct - s.z*st, s.y*st + s.z*ct);
  vec2 spherePos = s.xy * 0.99;
  float depth = s.z;
  float limb = pow(1.0 - abs(depth), 2.5);
  float ra = u*TAU + uSpin*0.35;
  float rr = 1.0 + (aSeed.z - 0.5) * 0.06 + (aSeed.w - 0.5) * 0.02;
  vec2 ringPos = vec2(cos(ra), sin(ra)) * rr;
  vec2 formPos = mix(spherePos, ringPos, uForm);
  float formA = mix(0.06 + 0.22*limb + 0.12*max(depth, 0.0), 0.35 + 0.35*aSeed.w, uForm);
  float delay = aSeed.w * 0.40;
  float mt = smoothstep(delay, delay + 0.60, uMorph);
  vec2 bulge = vec2(sin(aSeed.z*TAU), cos(aSeed.x*TAU)) * 0.22;
  vec2 mid = (formPos + aTarget) * 0.5 + bulge;
  vec2 pos = mix(mix(formPos, mid, mt), mix(mid, aTarget, mt), mt);

  float mo = uMotion * (1.0 - 0.65 * uPaused);
  float dockDisp = mix(1.0, 0.42, uDock);

  // 1. Ambient / Idle breathing (calibrated for dock scale)
  pos += vec2(sin(uTime*1.1 + aSeed.x*63.0), cos(uTime*0.9 + aSeed.y*57.0)) * (0.003 + 0.006*uLevel) * mo * dockDisp;

  // 1b. IDLE — BREATHE (calm cyan/blue presence, gentle continuous drift)
  if (uIdle > 0.01) {
    float idleK = uIdle * mo * dockDisp;
    float idleFloat = sin(pos.y * 3.2 + uTime * 0.95 + aSeed.x * 4.0) * 0.012 * idleK;
    pos += normalize(pos + 1e-4) * idleFloat;
    pos.y += sin(uTime * 0.75 + aSeed.x * 2.0) * 0.008 * idleK;
  }

  // 2. LISTENING — INWARD ABSORPTION (from left & right, reactive to uInputAudio)
  if (uListen > 0.01) {
    float inDirX = -sign(pos.x);
    float waveDist = abs(pos.x);
    float inWave = sin(waveDist * 14.0 + uTime * 9.5 + aSeed.y * 3.14);
    float absorbAmt = (0.022 + 0.065 * uInputAudio) * uListen * smoothstep(0.18, 1.15, waveDist);
    pos.x += inDirX * absorbAmt * (0.65 + 0.35 * inWave);
    pos.y += sin(pos.y * 7.5 + uTime * 5.5) * 0.012 * (0.4 + 0.6 * uInputAudio) * uListen;
  }

  // 3. THINKING — INTERNAL REORGANIZATION (nodes connect, information paths drift, sphere stable)
  float tEdge = smoothstep(0.55, 0.95, length(pos));
  if (uThink > 0.01) {
    float k = uThink * mo * dockDisp;
    float interiorK = (1.0 - tEdge) * k;
    float gs = 0.092;
    vec2 rp = rot2(pos, 0.32 + sin(uTime * 0.18) * 0.08);
    vec2 snapped = (floor(rp / gs) + 0.5) * gs;
    float snapCycle = sin(uTime * 1.5 + aSeed.x * 6.28) * 0.5 + 0.5;
    pos = mix(pos, rot2(snapped, -0.32), 0.32 * interiorK * snapCycle);
    float regionShift = sin(pos.x * 4.2 + uTime * 0.75) * cos(pos.y * 4.0 - uTime * 0.65);
    pos += normalize(pos + 1e-4) * regionShift * 0.014 * interiorK;
    pos += vec2(sin(pos.y * 5.0 + uTime * 0.5), cos(pos.x * 5.0 - uTime * 0.4)) * 0.006 * interiorK;
  }

  // 4. RENDERING — CONSTRUCTIVE SCAN/ASSEMBLY PASSES (building, assembling)
  float scanEffect = 0.0;
  if (uRender > 0.01) {
    float sY = mod(uTime * 0.85, 2.4) - 1.2;
    float sDist = abs(pos.y - sY);
    float sBand = gauss(sDist, 0.11) * uRender;
    pos.y += (sY - pos.y) * 0.20 * sBand;
    float diagScan = gauss(pos.x * 0.55 + pos.y - mod(uTime * 1.2, 2.6) + 1.3, 0.08) * uRender;
    scanEffect = clamp(sBand + diagScan * 0.55, 0.0, 2.0);
    pos += vec2(sin(aSeed.z * TAU), cos(aSeed.w * TAU)) * scanEffect * 0.04 * mo * dockDisp;
  }

  // 5. SPEAKING — OUTWARD EMISSION (flowing ribbons, radiating outward, reactive to uOutputAudio)
  if (uSpeak > 0.01) {
    vec2 outDir = normalize(pos + 1e-4);
    float rad = length(pos);
    float stream = sin(pos.x * 6.5 + pos.y * 4.8 - uTime * 7.5 + aSeed.z * 6.28);
    float emitWave = (0.035 + 0.095 * uOutputAudio) * (1.0 + 0.35 * stream) * uSpeak;
    pos += outDir * emitWave * smoothstep(0.32, 1.0, rad);
    pos.y += sin(pos.x * 7.2 - uTime * 6.2) * 0.026 * (0.35 + 0.65 * uOutputAudio) * uSpeak;
  }

  // 6. PAUSE — TRANQUIL SETTLING (motion reduced by 85%, settled presence)
  if (uPause > 0.01) {
    pos *= 1.0 - 0.018 * uPause;
    vec2 pauseDrift = vec2(sin(uTime * 0.4 + aSeed.x * 6.28), cos(uTime * 0.35 + aSeed.y * 6.28)) * 0.005 * uPause;
    pos += pauseDrift;
  }

  // 7. COMPLETED — CONVERGE / RESOLVE (cyan -> converge -> green flash -> expand -> calm)
  if (uCompleted > 0.01) {
    float cp = uCompletedProgress;
    float conv = smoothstep(0.0, 0.22, cp) * (1.0 - smoothstep(0.28, 0.45, cp));
    pos -= normalize(pos + 1e-4) * conv * 0.065 * uCompleted;
    float expand = smoothstep(0.40, 0.60, cp) * (1.0 - smoothstep(0.75, 0.95, cp));
    pos += normalize(pos + 1e-4) * expand * 0.045 * uCompleted;
  }

  // 8. BLOCKED — RESTRAINED RESISTANCE (tension, interrupted flow, rose accents)
  if (uBlocked > 0.01) {
    float stutter = sin(uTime * 16.0 + aSeed.x * 24.0);
    pos += vec2(stutter * 0.006, 0.0) * uBlocked;
    float edgeTension = smoothstep(0.72, 1.05, length(pos));
    float fragNoise = hash21(aSeed.xy);
    pos += normalize(pos + 1e-4) * (fragNoise - 0.5) * 0.032 * edgeTension * uBlocked;
  }

  // WAKE-UP : converge from a scattered shell into the form
  float wakeK = 1.0;
  if (uWake > 0.001 && uWake < 1.0) {
    wakeK = smoothstep(0.0, 1.0, uWake * 1.35 - aSeed.w * 0.35);
    float sa = aSeed.x * TAU + uTime * 0.15 * mo;
    // Enhanced scatter: wider for ring form, with radial burst
    float scatterR = (2.6 + aSeed.z * 2.2) * (1.0 + uForm * 0.55);
    vec2 scatter = vec2(cos(sa), sin(sa)) * scatterR + (aSeed.ww - 0.5) * 0.65;
    pos = mix(scatter, pos, wakeK);
  }

  // Idle / pause posture: deep U-bow only if explicitly non-zero
  if (uBow > 0.001) {
    float bowK = uBow;
    pos.y = pos.y * mix(1.0, 0.68, bowK) - 0.14 * bowK;
    pos.x *= mix(1.0, 0.94, bowK);
    float sideLift = pow(abs(pos.x), 1.55) * 0.22 * bowK;
    pos.y += sideLift;
    pos.x *= 1.0 + 0.10 * bowK * clamp(-pos.y + 0.15, 0.0, 1.0);
    float arcWave = sin(pos.x * 3.2 + uTime * 1.65) * 0.018 * bowK * mo
                  + sin(pos.x * 6.8 - uTime * 2.1) * 0.008 * bowK * mo;
    pos.y += arcWave;
  }
  pos += uHang;

  // ---- per-state colour + glow of the shape ----
  float pang = atan(pos.y, pos.x);
  vec3 c = mix(rimColor(pang), uShapeTint, uShapeTintAmt);
  c = mix(c, vec3(0.85, 0.95, 1.0), limb*0.5*(1.0-uForm)*(1.0-mt));
  c = mix(c, vec3(0.35, 1.0, 0.88), scanEffect * 0.70);

  float spark = step(mix(0.992, 0.980, uSparkle), aSeed.z);
  float tw = 0.75 + 0.25 * sin(uTime * (2.0 + aSeed.x * 4.0) + aSeed.y * 20.0);

  float baseAlpha = mix(formA, 0.65 + 0.35*aSeed.w, mt);
  float onlyPartAlpha = mix(baseAlpha, baseAlpha * 1.85 + 0.25, uOnlyParticles);
  float a = onlyPartAlpha * uGain * tw * uShapeGlow * mix(1.0, 1.25, uDock);
  a *= 1.0 + spark * 1.8 * uSparkle;
  a += scanEffect * 0.55;

  // Listening: flank impact brightening
  if (uListen > 0.01) {
    float flank = smoothstep(0.40, 0.95, abs(pos.x));
    a *= 1.0 + flank * (0.45 + 1.15 * uInputAudio) * uListen;
  }
  // Speaking: vocal radiance
  if (uSpeak > 0.01) {
    a *= 1.0 + (0.35 + 1.05 * uOutputAudio) * uSpeak;
  }
  // Thinking: interior lit nodes
  if (uThink > 0.01) {
    float litNode = step(0.91, fract(aSeed.z * 6.0 + uTime * 0.32));
    float interiorK = (1.0 - tEdge) * uThink;
    a *= mix(1.0, mix(0.35, 2.1, litNode), interiorK);
  }
  // Pause: dimmed, quiet
  if (uPause > 0.01) {
    a *= mix(1.0, 0.80, uPause);
  }
  a *= 0.35 + 0.65 * wakeK;              // wake-up brightens as she lands

  float baseSize = 1.35 + 1.2*limb*(1.0-uForm) + 1.0*uForm + 1.5*mt;
  float size = baseSize * uDpr * uParticleScale * mix(1.0, 1.45, uOnlyParticles)
             * (1.0 + spark * 1.4 * uSparkle + scanEffect * 0.8) * mix(1.0, 0.58, uDock);
  // Idle: gentle soft swell
  size *= 1.0 + 0.12 * uIdle * sin(uTime * 1.5 + aSeed.x * 8.0);
  // Listening: impact swell
  if (uListen > 0.01) {
    float flank = smoothstep(0.40, 0.95, abs(pos.x));
    size *= 1.0 + flank * (0.2 + 0.45 * uInputAudio) * uListen;
  }
  // Speaking: output audio swell
  if (uSpeak > 0.01) {
    size *= 1.0 + (0.18 + 0.45 * uOutputAudio) * uSpeak;
  }
  // Thinking: node sizing
  if (uThink > 0.01) {
    float litNode = step(0.91, fract(aSeed.z * 6.0 + uTime * 0.32));
    size *= mix(1.0, mix(0.75, 1.35, litNode), (1.0 - tEdge) * uThink);
  }
  // Pause: diamond settling
  if (uPause > 0.01) {
    float pauseSpark = step(0.970, aSeed.z) * (0.5 + 0.5 * sin(uTime * 3.0 + aSeed.w * 24.0));
    size *= mix(1.0, 0.88 + 0.25 * pauseSpark, uPause);
  }
  size *= mix(1.12, 1.0, wakeK);          // wake-up: points arrive gently then settle

  // Completed: emerald success event
  if (uCompleted > 0.01) {
    float cp = uCompletedProgress;
    float greenPulse = smoothstep(0.22, 0.40, cp) * (1.0 - smoothstep(0.65, 0.88, cp)) * uCompleted;
    vec3 greenCol = vec3(0.25, 0.98, 0.55);
    c = mix(c, greenCol, greenPulse * 0.85);
    a *= 1.0 + greenPulse * 0.85;
    size *= 1.0 + greenPulse * 0.45;
  }

  // Blocked: restrained rose/red tension
  if (uBlocked > 0.01) {
    float edgeTension = smoothstep(0.72, 1.05, length(pos));
    vec3 roseCol = vec3(0.95, 0.26, 0.36);
    c = mix(c, roseCol, uBlocked * (0.42 + 0.38 * edgeTension));
    a *= 1.0 + 0.22 * sin(uTime * 11.0) * uBlocked;
  }

  // pause: serene desaturation of shape particles into calm silver starlight
  if (uPaused > 0.01) {
    float pLuma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, vec3(pLuma * 0.88), uPaused * 0.92);
  }
  // idle: deep cosmic serenity wash
  if (uIdle > 0.01) {
    vec3 idleGlow = mix(vec3(0.36, 0.72, 1.0), vec3(0.62, 0.48, 1.0), 0.35 + 0.35 * sin(pang + uTime * 0.5));
    c = mix(c, idleGlow, uIdle * 0.35);
  }

  // user color saturation control
  c = adjustSat(c, uSaturation);

  vCol = vec4(c, clamp(a, 0.0, 1.0));
  gl_PointSize = max(1.0, size);
  vec2 scr = uCenter + pos * uR * uBodyScale;
  gl_Position = vec4(vec2(scr.x / uVP.x, scr.y / uVP.y) * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const PARTICLE_FS = `#version 300 es
precision highp float;
in vec4 vCol;
out vec4 frag;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r2 = dot(q,q)*4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2*3.2) * (1.0 - r2*0.65);
  frag = vec4(vCol.rgb * vCol.a * a, 1.0);
}
`;

export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 frag;
void main(){
  vec3 acc = texture(uTex, vUv).rgb * 0.2270270270;
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  acc += (texture(uTex, vUv + o1).rgb + texture(uTex, vUv - o1).rgb) * 0.3162162162;
  acc += (texture(uTex, vUv + o2).rgb + texture(uTex, vUv - o2).rgb) * 0.0702702703;
  frag = vec4(acc, 1.0);
}
`;

export const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uB1;
uniform sampler2D uB2;
uniform float uExposure;
out vec4 frag;

// High-frequency Jimenez Interleaved Gradient Noise for 8-bit banding removal
float ign(vec2 p) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(p, magic.xy)));
}

void main(){
  vec3 sc = texture(uScene, vUv).rgb;
  vec3 b1 = texture(uB1, vUv).rgb;
  vec3 b2 = texture(uB2, vUv).rgb;
  vec3 c = sc + b1*0.46 + b2*0.28;
  c *= uExposure;
  // ACES Filmic Tone Map
  c = (c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14);
  // High-precision triangular dithering — eliminates all color banding and gradient lines
  float n1 = ign(gl_FragCoord.xy);
  float n2 = ign(gl_FragCoord.xy + vec2(0.5, 0.5));
  float dither = (n1 + n2 - 1.0) * (1.6 / 255.0);
  c += vec3(dither);
  frag = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

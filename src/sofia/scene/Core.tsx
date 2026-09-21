import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Drive } from './Scene'
import { useStore } from '../store'
import { personaById } from '../lib/personas'

/**
 * The reactor.
 *
 * Modelled on the classic Iron Man JARVIS dial: a stack of concentric
 * instrument rings rather than one soft torus — an outer ring with a gap at
 * six o'clock and a doubled arc at twelve, a dotted data track, a measurement
 * ring with a ruler of ticks and strings of zeros riding it, segmented arcs
 * with a bar graph bracketing the left, and one unbroken core ring that is
 * the brightest thing on the screen. The word J.A.R.V.I.S sits inside it in
 * etched steel rather than neon, exactly as projected light would read.
 *
 * It is drawn as a single camera-facing plane with a polar fragment shader,
 * as before: everything here is a function of radius and angle, and the
 * rings are crisp analytic strokes, not displaced geometry. The one thing a
 * shader cannot do is glyphs — the zero strings and the centre word are
 * rasterised once into a canvas texture (real webfonts, real letterforms)
 * and sampled twice: once straight, for the word and the tiny upper zeros,
 * and once rotated, for the long zero bands that drift along their track.
 *
 * The particles that used to halo this are gone by request — the dial is the
 * whole subject now, and its atmosphere is the bloom on the lines themselves.
 */

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform sampler2D uGlyphs;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uLevel;
  uniform float uPhase;
  uniform float uRing;
  uniform float uOpen;
  uniform float uZoom;
  uniform float uIntensity;
  uniform float uStyle;

  varying vec2 vUv;

  #define PI 3.14159265359
  #define TAU 6.28318530718

  // A soft complete circle at radius r0, w wide.
  float band(float r, float r0, float w) {
    return exp(-pow((r - r0) / w, 2.0));
  }

  // Signed shortest angular distance from c, wrapped.
  float adist(float a, float c) {
    return mod(a - c + PI, TAU) - PI;
  }

  // An angular window centred on c: 1 inside hw radians, eased over soft.
  float awin(float a, float c, float hw, float soft) {
    return 1.0 - smoothstep(hw - soft, hw, abs(adist(a, c)));
  }

  vec2 rot2(vec2 p, float t) {
    float c = cos(t), s = sin(t);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * uZoom;
    float r = length(p);
    float a = atan(p.y, p.x);
    float lv = uLevel;

    // -- style ---------------------------------------------------------------
    // Weights on the terms that already exist, per the old contract: 'ring' is
    // the authored dial untouched, 'sphere' trades outline for a lit body,
    // 'wire' keeps the fine instrument lines and drops the washes.
    float wSphere = clamp(1.0 - abs(uStyle - 1.0), 0.0, 1.0);
    float wWire   = clamp(1.0 - abs(uStyle - 2.0), 0.0, 1.0);

    float kOutline = mix(1.0, 0.55, wSphere) * mix(1.0, 0.80, wWire);
    float kDetail  = mix(1.0, 0.60, wSphere) * mix(1.0, 1.70, wWire);
    float kWash    = mix(1.0, 1.90, wSphere) * mix(1.0, 0.00, wWire);
    float kGlow    = mix(1.0, 2.10, wSphere) * mix(1.0, 0.35, wWire);

    // -- washes ---------------------------------------------------------------
    // The reference's deep navy gradient, kept faint — the page behind the
    // canvas is already near-black, so this is atmosphere, not backdrop.
    float bg    = exp(-r * 1.7) * 0.05;
    float inner = smoothstep(0.42, 0.08, r) * (0.045 + lv * 0.05);

    // -- R1: the outer ring (r 0.95) -----------------------------------------
    // A gap at six o'clock, a doubled bright arc at twelve, dashes sweeping
    // two-to-four, a cluster of dots at four-to-five, three block ticks at
    // nine-to-ten. The asymmetry is the "active instrument" read.
    float gapMask = 1.0 - awin(a, -PI * 0.5, 0.26, 0.05);
    float topArc  = band(r, 0.95, 0.022) * awin(a, PI * 0.5, 0.52, 0.18);
    float dashes  = step(0.5, fract(a * 24.0 / TAU))
                  * awin(a, 0.0, 0.62, 0.10);
    float dots = 0.0;
    for (int i = 0; i < 9; i++) {
      dots += awin(a, -0.52 - float(i) * 0.068, 0.016, 0.009);
    }
    float ticks = awin(a, 2.71, 0.038, 0.012)
                + awin(a, 2.88, 0.038, 0.012)
                + awin(a, 3.05, 0.038, 0.012);
    float r1 = band(r, 0.95, 0.013) * gapMask * (0.70 + lv * 0.25)
             + topArc * (1.00 + lv * 0.45)
             + band(r, 0.95, 0.013) * dashes * 0.85
             + band(r, 0.95, 0.009) * dots * 0.90
             + band(r, 0.95, 0.016) * ticks * 0.90;

    // -- R2: the dotted data track (r 0.86) -----------------------------------
    // A hairline perforated into dots, with a brighter arc riding the top
    // under the tiny zero readout.
    float dotPat = smoothstep(0.30, 0.70, fract(a * 72.0 / TAU));
    float r2 = band(r, 0.86, 0.0055) * (0.30 + 0.70 * dotPat) * 0.55
             + band(r, 0.86, 0.0085) * awin(a, PI * 0.5, 0.55, 0.20) * 0.75;

    // -- R3: the measurement ring (r 0.72) + ruler ----------------------------
    // A fine circle with a ruler of ticks outside it: one every 12 degrees,
    // a longer one every 60. The zero bands ride this track (below).
    float tFine = fract(a * 30.0 / TAU);
    float tickFine = 1.0 - smoothstep(0.03, 0.12, abs(tFine - 0.5));
    float tCoarse = fract(a * 6.0 / TAU);
    float tickCoarse = 1.0 - smoothstep(0.012, 0.06, abs(tCoarse - 0.5));
    float r3 = band(r, 0.72, 0.0045) * 0.60
             + band(r, 0.752, 0.014) * tickFine * 0.45
             + band(r, 0.762, 0.024) * tickCoarse * 0.50;

    // -- R4: segmented arcs (r 0.58), drifting --------------------------------
    // Four arcs with the gaps centred on the diagonals, turning slowly. The
    // bar graph brackets the left side and stays put — an equaliser pinned
    // to the dial, its bars breathing with the voice.
    float a4 = a + uRing * 0.7;
    float seg = awin(a4, PI * 0.25, 0.46, 0.06)
              + awin(a4, PI * 0.75, 0.46, 0.06)
              + awin(a4, -PI * 0.75, 0.46, 0.06)
              + awin(a4, -PI * 0.25, 0.46, 0.06);
    float r4 = band(r, 0.58, 0.0085) * seg * 0.90;

    float bars = 0.0;
    for (int i = 0; i < 7; i++) {
      float ang = 2.62 + float(i) * 0.175;
      float amp = 0.5 + 0.5 * sin(float(i) * 2.3 + uPhase * 0.6);
      float len = 0.028 + 0.055 * amp * (0.35 + lv * 0.95);
      float rIn = 0.60;
      float rOut = rIn + len;
      bars += awin(a, ang, 0.020, 0.010)
            * smoothstep(rIn - 0.004, rIn + 0.004, r)
            * (1.0 - smoothstep(rOut - 0.004, rOut + 0.004, r));
    }

    // -- R5: the core ring (r 0.42) --------------------------------------------
    // Unbroken and the brightest element in the design — a neon tube. Its
    // glow is the bloom pass doing the work; this is just the tube.
    float r5 = band(r, 0.42, 0.0125) * (1.45 + lv * 0.55);
    float r5glow = exp(-pow((r - 0.42) / 0.075, 2.0)) * 0.40;

    // -- the sweep --------------------------------------------------------------
    // A soft luminous wedge travelling the outer band with a fading wake —
    // the one moving element the eye locks onto, kept from the old core.
    float sweepA = mod(uPhase * 0.5, TAU);
    float dA = adist(a, sweepA);
    float wake = smoothstep(-2.4, -0.12, dA) * (1.0 - smoothstep(0.0, 0.18, dA));
    float sweep = wake * band(r, 0.95, 0.09) * (0.40 + lv * 0.45);

    // -- glyphs -----------------------------------------------------------------
    // One texture, sampled twice. The straight sample carries the centre word
    // and the tiny zeros on R2; the rotated sample carries the long zero bands
    // on R3, drifting along their track. Rotation preserves radius, so each
    // use is masked to its own annulus and the word never turns.
    float gS = texture2D(uGlyphs, p * 0.5 + 0.5).a;
    float word = gS * (1.0 - smoothstep(0.44, 0.50, r));
    float tinyZeros = gS * band(r, 0.86, 0.05);
    vec2 q3 = rot2(p, -uRing * 0.5);
    float gR = texture2D(uGlyphs, q3 * 0.5 + 0.5).a;
    float zeros = gR * band(r, 0.72, 0.055);

    // -- assemble ------------------------------------------------------------------
    float h = clamp(r5 * 0.75 + sweep * 0.8 + topArc * 0.5, 0.0, 1.0);
    vec3 ringCol = mix(uColor, uHot, h);
    // The word is etched steel, not neon — fixed cool grey, tinted only
    // slightly by whatever the phase has done to the rest of the dial.
    vec3 wordCol = mix(vec3(0.62, 0.74, 0.84), uColor, 0.30);

    float v = (r1 + r2 + r3 + r4) * kOutline
            + (bars + zeros * 0.80 + tinyZeros * 0.65) * kDetail
            + r5 + sweep
            + r5glow * kGlow
            + (bg + inner) * kWash;

    float wordTerm = word * 0.95;
    v += wordTerm;
    float wordShare = wordTerm / max(v, 0.0001);
    vec3 col = mix(ringCol, wordCol, clamp(wordShare, 0.0, 1.0));

    // Radial reveal on power-up: the dial assembles from the centre outward.
    v *= smoothstep(0.0, 0.35, uOpen - r * 0.45);

    // Brightness authority for the whole dial, applied last. 1.0 is authored.
    v *= uIntensity;

    gl_FragColor = vec4(col * v, v);
  }
`

/**
 * The zero bands and the centre word, rasterised onto a canvas the shader
 * samples.
 *
 * A shader cannot draw letterforms, so the glyphs live in a 2048-square
 * canvas whose centre is the origin and whose half-width is one field unit —
 * the same coordinate frame the shader addresses, so the mapping is p * 0.5
 * + 0.5 and nothing else. Text on the top arc is upright and reads
 * left-to-right; text on the bottom arc keeps its tops toward the centre,
 * which is how the reference draws it.
 *
 * Only the alpha channel is consumed; the glyphs are drawn white and tinted
 * in the shader by the phase colour like every other line.
 *
 * Drawn synchronously with whatever fonts are available the moment the dial
 * mounts, then redrawn once document.fonts.ready says the real webfonts are
 * in — an empty dial while a font request hung in the void is worse than a
 * beat of fallback letterforms, and needsUpdate on the same canvas swaps
 * them without touching the binding. The same redraw path serves a persona
 * switch: the word at the centre of the dial is the character's name.
 */
const GLYPH_SIZE = 2048

function drawGlyphs(canvas: HTMLCanvasElement, word: string) {
  const U = GLYPH_SIZE / 2 // one field unit, in canvas pixels
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, GLYPH_SIZE, GLYPH_SIZE)
  ctx.translate(U, U)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const arcText = (
    text: string,
    radius: number,
    from: number,
    to: number,
    font: string,
    alpha: number,
    side: 'top' | 'bottom',
  ) => {
    ctx.save()
    ctx.font = font
    ctx.globalAlpha = alpha
    const n = text.length
    for (let i = 0; i < n; i++) {
      const t = from + ((i + 0.5) / n) * (to - from)
      ctx.save()
      ctx.rotate(t)
      ctx.translate(0, side === 'top' ? -radius : radius)
      ctx.fillText(text[i], 0, 0)
      ctx.restore()
    }
    ctx.restore()
  }

  const mono = (px: number) => `300 ${px}px "JetBrains Mono", monospace`

  // The long band on the measurement ring: upper string bright, lower one
  // smaller and dimmer, as the reference draws them.
  arcText('0'.repeat(34), 0.715 * U, -1.42, 1.42, mono(36), 0.95, 'top')
  arcText('0'.repeat(24), 0.715 * U, 1.15, -1.15, mono(27), 0.55, 'bottom')
  // The tiny readout riding the data track's brighter top arc.
  arcText('0'.repeat(14), 0.86 * U, -0.55, 0.55, mono(22), 0.8, 'top')

  // The centre word, placed letter by letter so the tracking is real
  // everywhere: ctx.letterSpacing is not yet universal.
  const px = 0.125 * U
  const track = 0.018 * U
  ctx.font = `600 ${px}px "Chakra Petch", sans-serif`
  const widths = [...word].map((ch) => ctx.measureText(ch).width)
  const total =
    widths.reduce((s, w) => s + w, 0) + track * (word.length - 1)
  let x = -total / 2
  for (let i = 0; i < word.length; i++) {
    ctx.fillText(word[i], x + widths[i] / 2, 0)
    x += widths[i] + track
  }
}

/** The plane's half-width in world units. */
const HALF = 2.7
/** Radius, in the shader's own field units, of the outermost ring. */
const RING_R = 0.95
/**
 * Outer ring diameter as a fraction of the SHORTER viewport dimension.
 *
 * Framing has to be driven by the viewport rather than by a constant, because
 * the plane is a fixed size in world units while the frame is not: the same
 * scale that leaves a comfortable margin on a 16:9 monitor runs the dial off
 * both edges of a portrait window.
 */
const FIT = 0.7

export function Core({ drive }: { drive: Drive }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const viewport = useThree((s) => s.viewport)
  const persona = useStore((s) => s.persona)
  const word = personaById(persona).dialWord

  /**
   * The glyph sheet, drawn before the first frame and kept for the life of
   * the dial. The canvas is redrawn in place when the webfonts land or the
   * persona changes, so the binding never changes — only the pixels under
   * it do.
   */
  const glyphs = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = GLYPH_SIZE
    // The persona's word, as of mount; later switches redraw through the
    // effect below rather than rebuilding the texture.
    drawGlyphs(canvas, word)
    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 4
    return { canvas, texture }
  }, [word])

  useEffect(() => {
    drawGlyphs(glyphs.canvas, word)
    glyphs.texture.needsUpdate = true
  }, [glyphs, word])

  useEffect(() => {
    let alive = true
    // Whatever fonts are ready now already drew it; swap in the real
    // letterforms once the document's fonts have settled. fonts.ready always
    // settles — unlike fonts.load for a named face, which can hang off a
    // stylesheet that is still fetching.
    document.fonts?.ready.then(() => {
      if (!alive) return
      drawGlyphs(
        glyphs.canvas,
        personaById(useStore.getState().persona).dialWord,
      )
      glyphs.texture.needsUpdate = true
    })
    return () => {
      alive = false
    }
  }, [glyphs])

  useEffect(() => () => glyphs.texture.dispose(), [glyphs])

  const uniforms = useMemo(
    () => ({
      uGlyphs: { value: glyphs.texture },
      uColor: { value: new THREE.Color('#19c4c4') },
      // Not white — a tinted highlight keeps the hue readable once bloom
      // stacks on top, instead of washing the core ring out to a grey band.
      uHot: { value: new THREE.Color('#b9fdff') },
      uLevel: { value: 0 },
      uPhase: { value: 0 },
      // Accumulated ring rotation, so rate changes never teleport a layer.
      uRing: { value: 0 },
      uOpen: { value: 0 },
      // Field scale, recomputed every frame from the viewport — see below.
      uZoom: { value: 1.2 },
      // Both of these are deliberately identities at their defaults: the dial
      // renders byte for byte as it did before they existed.
      uIntensity: { value: 1 },
      uStyle: { value: 0 },
    }),
    [glyphs],
  )

  useFrame((_, dt) => {
    if (!mat.current || !mesh.current) return
    const u = mat.current.uniforms
    const r = drive.reactor

    mesh.current.visible = r.visible
    // Scaling the mesh rather than the shader's field. The rings sit at fixed
    // radii inside a fixed quad with dark margin around them, so zooming the
    // field out would push the dial past the quad's own edge and cut it off in
    // a square; moving the quad takes the margin along with it.
    mesh.current.scale.setScalar(r.scale)

    const fit = Math.min(viewport.width, viewport.height)
    u.uZoom.value = (RING_R * HALF) / (FIT * 0.5 * fit)
    u.uLevel.value += (drive.level - u.uLevel.value) * Math.min(1, dt * 8)
    // Accumulated, not derived from elapsed time scaled by level — scaling the
    // clock would rewrite all the drift that has already happened, and the
    // layers would visibly jump whenever the rate changed. The same rule
    // keeps uRing and the reactor spin multiplier on accumulators.
    u.uPhase.value += dt * (0.5 + u.uLevel.value * 0.7) * r.spin
    // The dial's layers drift at their own fixed shares of one accumulator,
    // whose rate rides the phase's spin table: the rings turn harder while
    // JARVIS works, and the drift never snaps when the phase changes.
    u.uRing.value +=
      dt * (0.10 + drive.spin * 0.085 + u.uLevel.value * 0.30)
    u.uOpen.value += (drive.open - u.uOpen.value) * Math.min(1, dt * 1.6)
    u.uIntensity.value = r.intensity
    u.uStyle.value = r.style
    ;(u.uColor.value as THREE.Color).lerp(r.color, Math.min(1, dt * 2.5))
  })

  return (
    <mesh ref={mesh} frustumCulled={false}>
      {/* One quad. The dial lives entirely in the fragment shader, so there is
          no geometry to tessellate and nothing to displace. */}
      <planeGeometry args={[5.4, 5.4]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={fragment}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}

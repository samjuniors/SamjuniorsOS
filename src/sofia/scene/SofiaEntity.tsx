import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Drive } from './Scene'

/**
 * SOFIA — the holographic entity.
 *
 * Someone, not something: the avatar is a woman made of light. A single
 * AI-generated portrait — a bust constructed from cyan filaments on a
 * near-black plate — is brought alive by the shader the way a hologram
 * projector would: the plate's own luminance is the performer, and
 * everything the machine feels is done to the projection, not the woman.
 *
 *   tint       the phase colour replaces the image's cyan chroma while its
 *              luminance is preserved (normalised against the colour's own
 *              luma), so thinking is an amber SOFIA and speaking a green one
 *              with every filament of the face still legible — the same
 *              contract the dial and the orb carry;
 *   scanlines  fine static lines drifting slowly, plus one thin brighter
 *              band that travels down the whole figure every few seconds —
 *              faster while the machine works;
 *   flicker    rare, gentle — one 1/8 s frame in thirty dips a little;
 *   voice      brightness breathes with the level, the figure swells a
 *              hair, and a stepped micro-jitter rides the horizontal while
 *              she speaks, like the projection struggling with the volume;
 *   power-up   the entity materialises bottom-to-top off the open signal:
 *              each pixel has a dissolve threshold made of its own luma
 *              (bright filaments condense first, dim fields last), the
 *              moving front carries a glowing edge, and the whole thing
 *              fades in under it.
 *
 * The ui_reactor contract maps the same way it always has: a colour
 * override re-tints the projection (still luminance-preserving — detected
 * as the reactor colour diverging from the phase colour, which only an
 * override ever does), intensity is the brightness authority, spin is
 * scanline energy — the sweep and the shimmer run faster and hotter — and
 * the styles are 'ring' for the full hologram, 'sphere' for the same
 * projection with the scanlines drawn denser and hotter, 'wire' for a
 * schematic trace of the brightest filaments over a faint grid.
 *
 * Everything happens in one camera-facing plane whose fragment shader
 * samples the portrait once per pixel — a handful of sin/hash ops, no
 * geometry, no lights. Additive blending over the void, as the dial and
 * the orb before it: black plate reads as absence, and bloom does the
 * rest.
 */

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec3  uColor;
  uniform vec3  uReactorColor;
  uniform vec3  uHot;
  uniform float uTime;
  uniform float uSweep;
  uniform float uDrift;
  uniform float uLevel;
  uniform float uOpen;
  uniform float uZoom;
  uniform float uIntensity;
  uniform float uSpin;
  uniform float uStyle;
  uniform float uVisible;

  varying vec2 vUv;

  const vec3 W = vec3(0.299, 0.587, 0.114);

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // A cell boundary line at each 1/freq — for the wire mode's grid.
  float gridLine(float x, float freq) {
    float f = fract(x * freq);
    return 1.0 - smoothstep(0.0, 0.06, min(f, 1.0 - f));
  }

  void main() {
    if (uVisible < 0.5) discard;

    // Field coordinates: the portrait spans exactly [-1, 1] on both axes,
    // with the quad's margin around it for the halo to die in.
    vec2 p = (vUv * 2.0 - 1.0) * uZoom;
    float lv = uLevel;

    // -- style ---------------------------------------------------------------
    // 'ring' is the authored hologram, 'sphere' the same projection with
    // denser scanlines (see the scanline block), 'wire' the schematic
    // trace. Weights, not branches.
    float wSphere = clamp(1.0 - abs(uStyle - 1.0), 0.0, 1.0);
    float wWire   = clamp(1.0 - abs(uStyle - 2.0), 0.0, 1.0);

    float kBody = mix(1.0, 1.30, wSphere) * mix(1.0, 0.12, wWire);
    float kFil  = mix(1.0, 0.70, wSphere) * mix(1.0, 1.60, wWire);
    float kHalo = mix(1.0, 1.30, wSphere) * mix(1.0, 0.30, wWire);

    // -- the portrait ---------------------------------------------------------
    // Sampled through a lens that breathes in a hair with the voice and
    // carries a stepped horizontal micro-jitter while she speaks — the
    // projection interference of a loud signal. The scanlines stay fixed
    // to the screen; only the picture wobbles, as under a real projector.
    vec2 q = p * (1.0 - lv * 0.02);
    float jig = hash(vec2(floor(uTime * 21.0), 2.0));
    q.x += (jig - 0.5) * lv * (0.006 + 0.020 * step(0.86, jig));
    vec3 tex = texture2D(uTex, q * 0.5 + 0.5).rgb;
    float luma = dot(tex, W);

    // The plate's own background is near-black and dies here, so the void
    // behind the hologram is the page's void.
    float cut = smoothstep(0.006, 0.030, luma);

    // -- tint -----------------------------------------------------------------
    // The phase colour replaces the image's chroma, not its light: the tint
    // is normalised to unit luma first, so an amber SOFIA is exactly as
    // bright as a cyan one. A reactor colour that has drifted from the
    // phase colour is an override — the only thing that ever drives them
    // apart — and takes the whole projection over, still preserving the
    // luminance.
    float ov = smoothstep(0.03, 0.14, distance(uReactorColor, uColor));
    vec3 tint = mix(uColor, uReactorColor, ov);
    vec3 tintN = tint / clamp(dot(tint, W), 0.35, 1.0);
    // A trace of the original cyan keeps the shadows cool under a warm tint.
    vec3 face = mix(vec3(luma), tex, 0.22) * tintN;
    // The brightest filaments climb toward white, as light does at its
    // peaks — bloom finishes the job.
    float hotM = smoothstep(0.30, 0.85, luma) * (1.0 - 0.4 * wWire);
    vec3 lit = mix(face, uHot * (0.35 + 0.65 * luma), hotM * 0.60);

    // -- scanlines --------------------------------------------------------------
    // Fine static lines drifting slowly, their contrast rising with the
    // reactor's spin energy — and packed tighter and deeper in style one,
    // the denser scanline look. Plus the sweep: one thin brighter band that
    // travels down the whole figure, uSweep an accumulator so rate changes
    // never teleport it mid-face.
    float fineFreq = mix(480.0, 780.0, wSphere);
    float fine = 0.90 + (0.08 + 0.06 * wSphere + 0.05 * clamp(uSpin, 0.0, 3.0))
               * sin(vUv.y * fineFreq - uDrift * 3.0);
    float sweepPos = 1.0 - fract(uSweep);
    float band = exp(-pow((vUv.y - sweepPos) / 0.030, 2.0));
    float sweepBoost = 1.0 + band * (0.30 + 0.40 * lv);

    // -- flicker ----------------------------------------------------------------
    // One 1/8 s frame in thirty dips a little. Mostly it is nothing.
    float fl = 1.0 - 0.14 * step(0.968, hash(vec2(floor(uTime * 8.0), 5.0)));

    // -- filaments ---------------------------------------------------------------
    // The bright lines of the portrait — cheekbones, eyes, hair of light —
    // separated from the dim body so the styles can treat them apart.
    float fil = smoothstep(0.26, 0.60, luma);

    // -- halo ---------------------------------------------------------------------
    // A soft radial glow behind the bust, centred on the face, dying before
    // the quad's edge.
    vec2 hp = (vUv - vec2(0.5, 0.44)) * vec2(0.82, 1.0);
    float halo = exp(-length(hp) * uZoom * 2.4) * (0.19 + lv * 0.12);

    // -- power-up reveal -------------------------------------------------------------
    // Bottom-to-top: the front sweeps up through the picture, and each pixel
    // condenses once the front has passed its own threshold — bright pixels
    // early (their luma discounts the wait), dim ones last. The front itself
    // glows. The whole projection also fades in under it.
    float reveal = clamp(uOpen / 1.6, 0.0, 1.0);
    float front = reveal * 1.60 - 0.12;
    float need = (1.0 - luma) * 0.34;
    float local = front - vUv.y;
    float present = smoothstep(need, need + 0.10, local);
    float fade = smoothstep(0.0, 0.12, reveal);
    float opening = smoothstep(0.01, 0.06, reveal)
                  * (1.0 - smoothstep(0.93, 0.99, reveal));
    float edge = exp(-pow((local - need) / 0.055, 2.0)) * opening;

    // -- wire grid --------------------------------------------------------------------
    // In wire mode only: a faint survey grid over the figure, in the
    // portrait's own frame.
    vec2 iuv = p * 0.5 + 0.5;
    float inImg = step(0.0, iuv.x) * step(iuv.x, 1.0)
                * step(0.0, iuv.y) * step(iuv.y, 1.0);
    float grid = max(gridLine(iuv.x, 26.0), gridLine(iuv.y, 26.0))
               * 0.20 * wWire * inImg;

    // -- assemble -----------------------------------------------------------------------
    float amp = cut * fine * fl * sweepBoost * present * fade;
    // Tuned against the dial's wattage: the entity must read as a person of
    // light beside an instrument that blows to 255 — a whisper is a bug here.
    float pulse = 1.30 + lv * 0.45;

    vec3 acc = lit * (luma * pulse * kBody + fil * (0.58 + lv * 0.62) * kFil) * amp;
    // The dissolve front, bright enough to read as ignition.
    acc += mix(tintN, uHot, 0.45) * edge * (0.90 + lv * 0.50) * inImg * fade;
    // A breath of the sweep band across the whole figure, not only on the
    // bright lines.
    acc += tintN * band * inImg * 0.06 * (0.5 + lv) * fade;
    acc += tintN * grid * cut * fade;
    acc += tintN * halo * kHalo * fade;

    // Brightness authority for the whole entity, applied last. 1.0 is authored.
    acc *= uIntensity;

    float lum = max(max(acc.r, acc.g), acc.b);
    gl_FragColor = vec4(acc, clamp(lum, 0.0, 1.0));
  }
`

/**
 * The plane's half-width in world units. Oversized like the orb's — the
 * halo and the dissolve edge must have room to die before the quad's edge,
 * and at this size the edge is off-screen on every aspect this is framed on.
 */
const HALF = 3.5
/**
 * The portrait's height as a fraction of the SHORTER viewport dimension.
 * A bust reads taller than a dial of the same width, so it sits between
 * the reactor's 0.70 and the orb's 0.58.
 */
const FIT = 0.66

export function SofiaEntity({ drive }: { drive: Drive }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const viewport = useThree((s) => s.viewport)

  /**
   * The portrait, loaded once and kept for the life of the entity. Until
   * it arrives the sampler reads black, the plate-cut silences it, and only
   * the halo breathes — a local file, so the beat is a beat.
   */
  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load('/sofia/avatar-sofia.png')
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [])

  useEffect(() => () => tex.dispose(), [tex])

  const uniforms = useMemo(
    () => ({
      uTex: { value: tex },
      uColor: { value: new THREE.Color('#19c4c4') },
      uReactorColor: { value: new THREE.Color('#19c4c4') },
      uHot: { value: new THREE.Color('#b9fdff') },
      uTime: { value: 0 },
      // Accumulated scanline sweep — a rate change must never teleport the
      // band across her face. Same rule as the dial's rings.
      uSweep: { value: 0 },
      // Accumulated fine-line drift, its pace riding the reactor's spin.
      uDrift: { value: 0 },
      uLevel: { value: 0 },
      uOpen: { value: 0 },
      uZoom: { value: 1.2 },
      uIntensity: { value: 1 },
      uSpin: { value: 1 },
      uStyle: { value: 0 },
      uVisible: { value: 1 },
    }),
    [tex],
  )

  useFrame((state, dt) => {
    if (!mat.current || !mesh.current) return
    const u = mat.current.uniforms
    const r = drive.reactor

    mesh.current.visible = r.visible
    u.uVisible.value = r.visible ? 1 : 0
    mesh.current.scale.setScalar(r.scale)

    // The portrait spans one field unit of half-height; FIT says how much of
    // the shorter viewport dimension it owns.
    const fit = Math.min(viewport.width, viewport.height)
    u.uZoom.value = HALF / (FIT * 0.5 * fit)

    u.uTime.value = state.clock.elapsedTime
    u.uLevel.value += (drive.level - u.uLevel.value) * Math.min(1, dt * 8)
    // One lap of the sweep in ~8 s at rest, in ~4 s while the machine
    // thinks — the spin table's energy turns the projector up.
    u.uSweep.value += dt * (0.12 + u.uLevel.value * 0.09 + r.spin * 0.035)
    u.uDrift.value += dt * (0.4 + r.spin * 1.2)
    u.uOpen.value += (drive.open - u.uOpen.value) * Math.min(1, dt * 1.6)
    u.uIntensity.value = r.intensity
    u.uSpin.value = r.spin
    u.uStyle.value = r.style

    // Both colours arrive already smoothed by the Rig; copied, not lerped
    // again. Their distance is the override detector — see the shader.
    ;(u.uColor.value as THREE.Color).copy(drive.color)
    ;(u.uReactorColor.value as THREE.Color).copy(drive.reactor.color)
  })

  return (
    <mesh ref={mesh} frustumCulled={false}>
      {/* One quad, camera-facing; the entity lives entirely in the fragment
          shader. Oversized on purpose — see HALF. */}
      <planeGeometry args={[2 * HALF, 2 * HALF]} />
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

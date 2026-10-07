/**
 * lib/world-map.ts — real continent data for the World Monitor globe.
 *
 * Provenance: Natural Earth 110m land (world-atlas@2 `land-110m.json`,
 * decoded with topojson-client@3) rasterised to a 120x60 equirectangular
 * bitmask (MSB-first, base64). Land fraction ~30% — spot on for Earth.
 * Pure maths + data: no DOM, no deps, fully unit-tested.
 */

export const WORLD_W = 120;
export const WORLD_H = 60;

const WORLD_MASK_B64 =
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf4P+AAAAAAAAAAAAAAAD+P//ADQAAAYAAAAAAAZL8f/+AAAACADgAAAAAAYvsB/+AAAAgH/9BAAA8ADy/g/4AAMADf///+Ah////64/gAB/z/f/////A////7wcBgDv///////+B///+DAMAAPf//////9cAIP/+DoAACLP/////+BAAAD//j8AACCf/////4DAAAB//7+AAF////////CAAAAf//wAAB////////AAAAAf//wAAB/9f////9AAAAAf//gAAF34f////5AAAAAf/+AAAHBz////9gAAAAAf/+AAAHCX////+iAAAAAP/8AAAD4A////8MAAAAAH/4AAAH+Y////+QAAAAAB8IAAAP/+9///+AAAAAAA8AAAAf//+P//8AAAAAAAYEAAAf//fx/fwAAAAAAAcggAAf//Pg8egAAAAAAAHgAAA///vA4fCAAAAAAAAwAAA///8AYHAAAAAAAAAR0AAf//+AYBAAAAAAAAAD8AAP//+AAABAAAAAAAAD/gAEP/8AAIMAAAAAAAAD/gAAH/4AAG4AAAAAAAAH/4AAH/wAACaIAAAAAAAH/+AAD/gAACAHAAAAAAAH//AAD/gAAAwDgAAAAAAD//AAD/gAAAAAAAAAAAAB/+AAD/yAAAAZAAAAAAAA/+AAD/mAAAB9gAAAAAAAf+AAD/EAAAD/gAAAAAAAf8AAB/MAAAP/wAAAAAAA/wAAB+AAAAP/4AAAAAAA/wAAB+AAAAP/4AAAAAAA/gAAA8AAAAH/4AAAAAAA/AAAAgAAAAEDwAAAAAAB+AAAAAAAAAABwCAAAAAB4AAAAAAAAAAAACAAAAAAwAAAAAAAAAAAAEAAAAABwAAAAAAAAAAAAIAAAAABgAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAQAAAAADwH///gAAAAAAA4AAALv/+/////AAAAQL08AAf/////////wAB////gAH//////////gAj///8AcP//////////AAH////8////////////gACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function decodeB64(b64: string): Uint8Array {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lut = new Map<string, number>();
  for (let i = 0; i < abc.length; i++) lut.set(abc[i], i);
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let pos = 0;
  for (const ch of clean) {
    const v = lut.get(ch);
    if (v === undefined) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[pos++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

let decoded: Uint8Array | null = null;

export function maskBytes(): Uint8Array {
  if (!decoded) decoded = decodeB64(WORLD_MASK_B64);
  return decoded;
}

/** Fraction of cells that are land (sanity: Earth ≈ 0.29). */
export function landFraction(): number {
  const bytes = maskBytes();
  let land = 0;
  for (let i = 0; i < WORLD_W * WORLD_H; i++) {
    if (bytes[i >> 3] & (0x80 >> (i & 7))) land++;
  }
  return land / (WORLD_W * WORLD_H);
}

/** True if the coordinate is on land. Longitude wraps; latitude clamps. */
export function landAt(lat: number, lon: number): boolean {
  const la = Math.min(90, Math.max(-90, Number.isFinite(lat) ? lat : 0));
  let lo = Number.isFinite(lon) ? lon : 0;
  lo = ((((lo + 180) % 360) + 360) % 360) - 180;
  const c = Math.min(WORLD_W - 1, Math.max(0, Math.floor(((lo + 180) / 360) * WORLD_W)));
  const r = Math.min(WORLD_H - 1, Math.max(0, Math.floor(((90 - la) / 180) * WORLD_H)));
  const i = r * WORLD_W + c;
  return (maskBytes()[i >> 3] & (0x80 >> (i & 7))) !== 0;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Deterministic, evenly spread points on the sphere (Fibonacci lattice). */
export function fibonacciSphere(count: number): GeoPoint[] {
  const n = Math.max(1, Math.floor(count));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pts: GeoPoint[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const theta = golden * i;
    const lon = ((theta * 180) / Math.PI + 540) % 360 - 180;
    pts.push({ lat: (Math.asin(Math.min(1, Math.max(-1, y))) * 180) / Math.PI, lon });
  }
  return pts;
}

export interface Projected {
  /** Unit-disc coordinates. */
  x: number;
  y: number;
  visible: boolean;
}

/**
 * Orthographic projection. `rotation` spins the globe (radians, +east),
 * `tilt` tips the pole toward the viewer. View direction is +z.
 */
export function project(lat: number, lon: number, rotation: number, tilt = 0.41): Projected {
  const phi = (lat * Math.PI) / 180;
  const lambda = ((lon * Math.PI) / 180 + rotation) % (Math.PI * 2);
  const cosPhi = Math.cos(phi);
  const x = cosPhi * Math.sin(lambda);
  const y0 = Math.sin(phi);
  const z0 = cosPhi * Math.cos(lambda);
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const y = y0 * cosT - z0 * sinT;
  const z = y0 * sinT + z0 * cosT;
  return { x, y, visible: z > 0 };
}

/**
 * lib/wav.ts — dependency-free WAV codec helpers (browser & node).
 * Pure over Uint8Array so it's unit-testable without any DOM.
 */

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

export function parseWav(buf: Uint8Array): WavInfo {
  const b = buf;
  const ascii = (from: number, to: number) => Array.from(b.slice(from, to), (c) => String.fromCharCode(c)).join('');
  const u32 = (o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | ((b[o + 3] << 24) >>> 0)) >>> 0;
  const u16 = (o: number) => b[o] | (b[o + 1] << 8);
  if (b.length < 44 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WAVE') throw new Error('Not a WAV file');
  let off = 12;
  let fmt: { channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataLength = 0;
  while (off + 8 <= b.length) {
    const id = ascii(off, off + 4);
    const size = u32(off + 4);
    if (id === 'fmt ') {
      fmt = { channels: u16(off + 10), sampleRate: u32(off + 12), bitsPerSample: u16(off + 22) };
    } else if (id === 'data') {
      dataOffset = off + 8;
      dataLength = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!fmt || dataOffset < 0) throw new Error('Malformed WAV');
  return { ...fmt, dataOffset, dataLength: Math.min(dataLength, b.length - dataOffset) };
}

/** Extract 16-bit PCM (downmixing to mono) + sample rate from any PCM16 WAV. */
export function wavToPcm16Mono(buf: Uint8Array): { pcm: Uint8Array; sampleRate: number } {
  const w = parseWav(buf);
  if (w.bitsPerSample !== 16) throw new Error(`Unsupported bit depth ${w.bitsPerSample}`);
  const raw = buf.subarray(w.dataOffset, w.dataOffset + w.dataLength);
  if (w.channels === 1) return { pcm: new Uint8Array(raw), sampleRate: w.sampleRate };
  const frames = Math.floor(raw.length / (2 * w.channels));
  const out = new Uint8Array(frames * 2);
  const i16 = (o: number) => { const v = raw[o] | (raw[o + 1] << 8); return v >= 0x8000 ? v - 0x10000 : v; };
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < w.channels; c++) sum += i16((i * w.channels + c) * 2);
    const v = Math.max(-32768, Math.min(32767, Math.round(sum / w.channels)));
    out[i * 2] = v & 0xff;
    out[i * 2 + 1] = (v >> 8) & 0xff;
  }
  return { pcm: out, sampleRate: w.sampleRate };
}

/** Wrap raw 16-bit mono PCM in a WAV container. */
export function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  const u32 = (o: number, v: number) => { out[o] = v & 0xff; out[o + 1] = (v >> 8) & 0xff; out[o + 2] = (v >> 16) & 0xff; out[o + 3] = (v >>> 24) & 0xff; };
  const u16 = (o: number, v: number) => { out[o] = v & 0xff; out[o + 1] = (v >> 8) & 0xff; };
  wr(0, 'RIFF'); u32(4, 36 + pcm.length); wr(8, 'WAVE');
  wr(12, 'fmt '); u32(16, 16); u16(20, 1); u16(22, 1);
  u32(24, sampleRate); u32(28, sampleRate * 2); u16(32, 2); u16(34, 16);
  wr(36, 'data'); u32(40, pcm.length);
  out.set(pcm, 44);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + CH, bytes.length)));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

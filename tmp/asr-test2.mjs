import ZAI from 'z-ai-web-dev-sdk'
import { writeFileSync } from 'node:fs'
// 16kHz mono 16-bit sine+AM ~1.2s (speech-band-ish, not silent)
const sr = 16000, dur = 1.2, n = Math.floor(sr * dur)
const buf = Buffer.alloc(44 + n * 2)
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8)
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
for (let i = 0; i < n; i++) {
  const t = i / sr
  const v = Math.sin(2 * Math.PI * 220 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t))
  buf.writeInt16LE(Math.round(v * 12000), 44 + i * 2)
}
writeFileSync('/tmp/tone.wav', buf)
const zai = await ZAI.create()
try {
  const res = await zai.audio.asr.create({ file_base64: buf.toString('base64') })
  console.log('ASR RAW TYPE:', typeof res, res && typeof res === 'object' ? 'object' : '')
  console.log('ASR RESULT:', JSON.stringify(res).slice(0, 800))
} catch (e) {
  console.error('ASR FAILED:', e?.message ?? e)
}

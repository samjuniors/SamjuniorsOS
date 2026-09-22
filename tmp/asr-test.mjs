import ZAI from 'z-ai-web-dev-sdk'
const zai = await ZAI.create()
// make a tiny wav via TTS first
const tts = await zai.audio.tts.create({ input: 'Testing speech recognition.', voice: 'kazi', response_format: 'wav', stream: false })
const buf = Buffer.from(new Uint8Array(await tts.arrayBuffer()))
console.log('tts wav bytes:', buf.length)
const b64 = buf.toString('base64')
try {
  const res = await zai.audio.asr.create({ file_base64: b64 })
  console.log('ASR RAW KEYS:', Object.keys(res ?? {}))
  console.log('ASR RESULT:', JSON.stringify(res).slice(0, 600))
} catch (e) {
  console.error('ASR FAILED:', e?.message ?? e)
}

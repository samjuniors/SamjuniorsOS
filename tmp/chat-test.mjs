import ZAI from 'z-ai-web-dev-sdk'
const zai = await ZAI.create()
try {
  const res = await zai.chat.completions.create({ messages: [{ role: 'user', content: 'Say OK.' }], stream: false, thinking: { type: 'disabled' } })
  const reader = res?.getReader ? res.getReader() : null
  if (reader) {
    const dec = new TextDecoder(); let out = ''
    while (true) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }) }
    console.log('CHAT SSE:', out.replace(/\n/g, ' | ').slice(0, 400))
  } else {
    console.log('CHAT RAW:', JSON.stringify(res).slice(0, 400))
  }
} catch (e) { console.error('CHAT FAILED:', e?.message ?? e) }

import WebSocket from 'ws'
const ws = new WebSocket('ws://localhost:3000/ws', { headers: { origin: 'http://localhost:3000' } })
const t0 = Date.now()
let gotText = ''
ws.on('open', () => {
  console.log('[ws] open — asking…')
  ws.send(JSON.stringify({ type: 'ask', text: 'hey sofia what is two plus two', id: 't1', persona: 'sofia' }))
})
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.type === 'ready') console.log('[ws] ready · brain =', msg.brain?.label)
  else if (msg.type === 'provider') console.log(`[ws] PROVIDER SWITCH → ${msg.brain?.label} (${msg.brain?.id})`)
  else if (msg.type === 'text') gotText += msg.delta
  else if (msg.type === 'done') { console.log(`[ws] DONE in ${Date.now() - t0}ms: "${gotText.trim().slice(0, 140)}"`); process.exit(0) }
  else if (msg.type === 'error') { console.log(`[ws] ERROR: ${msg.message}`); process.exit(1) }
})
ws.on('error', (e) => { console.error('[ws] err', e.message); process.exit(1) })
setTimeout(() => { console.log('[ws] TIMEOUT — no answer in 60s'); process.exit(1) }, 60000)

/**
 * A fake OpenAI-compatible server for testing the fallback chains.
 *   - /v1/chat/completions  — streams a fixed SSE answer (text + [DONE])
 *   - /v1/audio/transcriptions — returns a fixed transcript
 *   - /v1/audio/speech — returns a valid tiny WAV
 *
 * Usage: node fake-providers.mjs 8790
 */
import http from 'node:http'

const port = Number(process.argv[2] || 8790)

function wav() {
  const sr = 16000, n = 8000
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 6000), 44 + i * 2)
  return b
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    console.log(`[fake] ${req.method} ${req.url}`)
    if (req.url.includes('/chat/completions')) {
      const answer = 'This is the local fallback engine answering. Two plus two is four.'
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const words = answer.split(' ')
      let i = 0
      const tick = setInterval(() => {
        if (i < words.length) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: words[i] + ' ' } }] })}\n\n`)
          i++
        } else {
          res.write('data: [DONE]\n\n')
          res.end()
          clearInterval(tick)
        }
      }, 15)
    } else if (req.url.includes('/audio/transcriptions')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ text: 'hey sofia what is two plus two' }))
    } else if (req.url.includes('/audio/speech')) {
      const b = wav()
      res.writeHead(200, { 'content-type': 'audio/wav' })
      res.end(b)
    } else {
      res.writeHead(404)
      res.end('no')
    }
  })
})
server.listen(port, () => console.log(`[fake] listening on :${port}`))

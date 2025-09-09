// bin/start.js
// 1) boot your bot
import '../src/index.js' // <-- adjust if your main entry is elsewhere

// 2) expose a minimal HTTP health endpoint for Fly
import http from 'http'
const PORT = process.env.PORT || 8080

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  } else {
    res.writeHead(404)
    res.end()
  }
})

server.listen(PORT, () => {
  console.log(`[health] listening on ${PORT}`)
})

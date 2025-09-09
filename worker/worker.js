// worker/worker.js
// Cloudflare Module Worker
export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const method = req.method.toUpperCase()
    const PUBLIC_ORIGIN = env.PUBLIC_ORIGIN || '*'

    // --- Helpers ---
    const corsJson = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'access-control-allow-origin': PUBLIC_ORIGIN,
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'cache-control': 'no-store'
        }
      })

    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': PUBLIC_ORIGIN,
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-max-age': '86400'
        }
      })
    }

    // ────────────────────────────────────────────────────────────
    // Public Commands (preset in KV; not published by the bot)
    // ────────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/api/commands') {
      const data = (await env.SITEDATA.get('commands', { type: 'json' })) ?? []
      return corsJson(data, 200)
    }

    // Mod-only commands (requires MOD_READ_TOKEN)
    if (method === 'GET' && url.pathname === '/api/commands_mod') {
      const auth = req.headers.get('authorization') || ''
      if (auth !== `Bearer ${env.MOD_READ_TOKEN}`) {
        return corsJson({ error: 'unauthorized' }, 401)
      }
      const data = (await env.SITEDATA.get('commands_mod', { type: 'json' })) ?? []
      return corsJson(data, 200)
    }

    // ────────────────────────────────────────────────────────────
    // Stats (real-time; written by the bot via PUBLISH_TOKEN)
    // ────────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/api/stats') {
      const data = (await env.SITEDATA.get('stats', { type: 'json' })) ?? {
        totals: { updatedAt: null, songsTracked: 0, albumsTracked: 0, songReviews: 0, albumReviews: 0 },
        topSongs: [],
        topAlbums: []
      }
      return corsJson(data, 200)
    }

    // Accept stats ONLY
    if (method === 'POST' && url.pathname === '/api/publish') {
      const auth = req.headers.get('authorization') || ''
      if (auth !== `Bearer ${env.PUBLISH_TOKEN}`) {
        return corsJson({ error: 'unauthorized' }, 401)
      }
      let body
      try {
        body = await req.json()
      } catch {
        return corsJson({ error: 'invalid JSON' }, 400)
      }
      if (!body || typeof body !== 'object' || !body.stats) {
        return corsJson({ error: 'expected { stats }' }, 400)
      }
      await env.SITEDATA.put('stats', JSON.stringify(body.stats))
      return corsJson({ ok: true }, 200)
    }

    // ────────────────────────────────────────────────────────────
    // (Optional) Admin endpoint to update preset commands
    // Uses PUBLISH_TOKEN (same as your bot’s publishing token).
    // You can also manage KV via wrangler CLI instead of this.
    // ────────────────────────────────────────────────────────────
    if (method === 'POST' && url.pathname === '/api/commands_admin') {
      const auth = req.headers.get('authorization') || ''
      if (auth !== `Bearer ${env.PUBLISH_TOKEN}`) {
        return corsJson({ error: 'unauthorized' }, 401)
      }
      let body
      try {
        body = await req.json()
      } catch {
        return corsJson({ error: 'invalid JSON' }, 400)
      }
      const { commands, commands_mod } = body || {}
      if (commands) await env.SITEDATA.put('commands', JSON.stringify(commands))
      if (commands_mod) await env.SITEDATA.put('commands_mod', JSON.stringify(commands_mod))
      return corsJson({ ok: true }, 200)
    }

    return corsJson({ error: 'not found' }, 404)
  }
}

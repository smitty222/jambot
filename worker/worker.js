// worker/worker.js
export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const method = req.method.toUpperCase()

    // Set in Cloudflare:
    //   PUBLISH_TOKEN  (secret)  -> for POST /api/publish
    //   MOD_READ_TOKEN (secret)  -> for GET  /api/commands_mod
    //   PUBLIC_ORIGIN  (var)     -> e.g. https://jambot.pages.dev  (defaults to '*')
    const PUBLIC_ORIGIN = env.PUBLIC_ORIGIN || '*'

    const baseHeaders = {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'vary': 'origin',
      'access-control-allow-origin': PUBLIC_ORIGIN,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization'
    }

    const j = (obj, status = 200, headers = baseHeaders) =>
      new Response(JSON.stringify(obj), { status, headers })

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: baseHeaders })
    }

    // ---------- Public GETs ----------
    if (method === 'GET' && url.pathname === '/api/health') {
      return j({ ok: true, ts: new Date().toISOString() })
    }

    if (method === 'GET' && url.pathname === '/api/commands') {
      const data = (await env.SITEDATA.get('commands', { type: 'json' })) ?? []
      return j(data)
    }

    if (method === 'GET' && url.pathname === '/api/stats') {
      const data = (await env.SITEDATA.get('stats', { type: 'json' })) ?? {}
      return j(data)
    }

    // ---------- 🔒 Mod-only GET ----------
    if (method === 'GET' && url.pathname === '/api/commands_mod') {
      const auth = req.headers.get('authorization') || ''
      if (auth !== `Bearer ${env.MOD_READ_TOKEN}`) {
        return j({ error: 'unauthorized' }, 401)
      }
      const data = (await env.SITEDATA.get('commands_mod', { type: 'json' })) ?? []
      return j(data)
    }

    // ---------- Private publish (PATCH-style) ----------
    if (method === 'POST' && url.pathname === '/api/publish') {
      const auth = req.headers.get('authorization') || ''
      if (auth !== `Bearer ${env.PUBLISH_TOKEN}`) {
        return j({ error: 'unauthorized' }, 401)
      }

      let body = {}
      try { body = await req.json() } catch {}

      const ops = []
      if (Object.prototype.hasOwnProperty.call(body, 'commands')) {
        ops.push(env.SITEDATA.put('commands', JSON.stringify(body.commands ?? [])))
      }
      if (Object.prototype.hasOwnProperty.call(body, 'commands_mod')) {
        ops.push(env.SITEDATA.put('commands_mod', JSON.stringify(body.commands_mod ?? [])))
      }
      if (Object.prototype.hasOwnProperty.call(body, 'stats')) {
        ops.push(env.SITEDATA.put('stats', JSON.stringify(body.stats ?? {})))
      }

      if (ops.length === 0) {
        return j({ ok: false, error: 'Include "commands", "commands_mod" and/or "stats" in body.' }, 400)
      }

      await Promise.all(ops)
      return j({ ok: true, updated: ops.length })
    }

    return new Response('Not found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'access-control-allow-origin': PUBLIC_ORIGIN
      }
    })
  }
}

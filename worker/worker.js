// worker/worker.js
// Cloudflare Module Worker (ESM) — API for commands + DB snapshots in KV

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const method = req.method.toUpperCase()
    const origin = env.PUBLIC_ORIGIN || '*'

    const corsJson = (data, status = 200, headers = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'access-control-allow-origin': origin,
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          ...headers
        }
      })

    if (method === 'OPTIONS') return corsJson({ ok: true }, 204)

    const hasBearer = (req, token) => (req.headers.get('authorization') || '') === `Bearer ${token}`
    const requireMod = () => hasBearer(req, env.MOD_READ_TOKEN) ? null : corsJson({ error: 'unauthorized' }, 401)
    const requirePublish = () => hasBearer(req, env.PUBLISH_TOKEN) ? null : corsJson({ error: 'unauthorized' }, 401)

    // ────────────────────────────────────────────────────────────────
    // Commands
    // ────────────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/api/commands') {
      const data = (await env.SITEDATA.get('commands', { type: 'json' })) ?? []
      return corsJson(data)
    }

    if (method === 'GET' && url.pathname === '/api/commands_mod') {
      const authErr = requireMod(); if (authErr) return authErr
      const data = (await env.SITEDATA.get('commands_mod', { type: 'json' })) ?? []
      return corsJson(data)
    }

    if (method === 'POST' && url.pathname === '/api/publishCommands') {
      const authErr = requirePublish(); if (authErr) return authErr
      let body; try { body = await req.json() } catch { return corsJson({ error: 'invalid JSON' }, 400) }
      const { commands, commands_mod } = body || {}
      if (commands)     await env.SITEDATA.put('commands', JSON.stringify(commands))
      if (commands_mod) await env.SITEDATA.put('commands_mod', JSON.stringify(commands_mod))
      return corsJson({ ok: true })
    }

    // ────────────────────────────────────────────────────────────────
    // Stats
    // ────────────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/api/stats') {
      const data = (await env.SITEDATA.get('stats', { type: 'json' })) ?? {
        totals: { updatedAt: null, songsTracked: 0, albumsTracked: 0, songReviews: 0, albumReviews: 0 },
        topSongs: [],
        topAlbums: []
      }
      return corsJson(data)
    }

    if (method === 'POST' && url.pathname === '/api/publishStats') {
      const authErr = requirePublish(); if (authErr) return authErr
      let body; try { body = await req.json() } catch { return corsJson({ error: 'invalid JSON' }, 400) }
      await env.SITEDATA.put('stats', JSON.stringify(body || {}))
      return corsJson({ ok: true })
    }

    // ────────────────────────────────────────────────────────────────
    // Tables list (compat with site UI)
    // ────────────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/api/tables') {
      const list = await env.SITEDATA.list({ prefix: 'db:' })
      const names = list.keys.map(k => k.name.replace(/^db:/, '')).sort()
      return corsJson({ public: names })
    }

    if (method === 'GET' && url.pathname === '/api/tables_mod') {
      const authErr = requireMod(); if (authErr) return authErr
      const list = await env.SITEDATA.list({ prefix: 'dbmod:' })
      const names = list.keys.map(k => k.name.replace(/^dbmod:/, '')).sort()
      return corsJson({ mod: names })
    }

    // ────────────────────────────────────────────────────────────────
    // DB snapshots
    // ────────────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/api/db/list') {
      const showMod = hasBearer(req, env.MOD_READ_TOKEN)
      const [pubList, modList] = await Promise.all([
        env.SITEDATA.list({ prefix: 'db:' }),
        showMod ? env.SITEDATA.list({ prefix: 'dbmod:' }) : Promise.resolve({ keys: [] })
      ])
      const toNames = (arr, pref) => arr.keys.map(k => k.name.replace(pref, ''))
      return corsJson({
        public: toNames(pubList, 'db:').sort(),
        mod: showMod ? toNames(modList, 'dbmod:').sort() : []
      })
    }

    if (method === 'GET' && url.pathname.startsWith('/api/db_mod/')) {
      const authErr = requireMod(); if (authErr) return authErr
      const name = decodeURIComponent(url.pathname.substring('/api/db_mod/'.length))
      const val = await env.SITEDATA.get(`dbmod:${name}`, { type: 'json' })
      return corsJson(val ?? [])
    }

    if (method === 'GET' && url.pathname.startsWith('/api/db/')) {
      const name = decodeURIComponent(url.pathname.substring('/api/db/'.length))
      const val = await env.SITEDATA.get(`db:${name}`, { type: 'json' })
      return corsJson(val ?? [])
    }

    if (method === 'POST' && url.pathname === '/api/publishDb') {
      const authErr = requirePublish(); if (authErr) return authErr
      let body; try { body = await req.json() } catch { return corsJson({ error: 'invalid JSON' }, 400) }

      // Accepts:
      //   { tables: { name: rows, ... }, public: ['name'], privateOnly: ['name'] }
      // or { items: [{ name, data }], public: [...], privateOnly: [...] }
      const items = []
      if (body?.tables && typeof body.tables === 'object') {
        for (const [name, data] of Object.entries(body.tables)) items.push({ name, data })
      } else if (Array.isArray(body?.items)) {
        for (const it of body.items) if (it && typeof it.name === 'string') items.push({ name: it.name, data: it.data ?? [] })
      } else {
        return corsJson({ error: 'missing tables/items' }, 400)
      }

      const pubList = new Set(body?.public || [])
      const privateOnly = new Set(body?.privateOnly || [])

      for (const { name, data } of items) {
        const json = JSON.stringify(data ?? [])
        if (privateOnly.has(name)) {
          // mod-only
          await env.SITEDATA.put(`dbmod:${name}`, json)
        } else if (pubList.has(name)) {
          // public + mirror to mod
          await env.SITEDATA.put(`db:${name}`, json)
          await env.SITEDATA.put(`dbmod:${name}`, json)
        } else {
          // default to mod-only
          await env.SITEDATA.put(`dbmod:${name}`, json)
        }
      }
      return corsJson({ ok: true, wrote: items.map(x => x.name) })
    }

    // ────────────────────────────────────────────────────────────────
    // Health / Not found
    // ────────────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/health') {
      return new Response('ok', { status: 200, headers: { 'access-control-allow-origin': origin } })
    }

    return corsJson({ error: 'not found' }, 404)
  }
}

// worker/worker.js
// Cloudflare Module Worker (ESM) — API for commands + DB snapshots in KV

// ───────────────────────────────────────────────────────────────
// CORS helpers
// ───────────────────────────────────────────────────────────────
function pickCorsOrigin (env, request) {
  const reqOrigin = request.headers.get('Origin') || '';
  const allowlist = String(env.PUBLIC_ORIGIN || '*')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Wildcard means "allow anything" but we still echo the caller when present
  if (allowlist.includes('*')) {
    return reqOrigin || '*';
  }
  // Strict allowlist
  return allowlist.includes(reqOrigin) ? reqOrigin : '';
}

function corsHeaders (env, request, extra = {}) {
  const origin = pickCorsOrigin(env, request);
  const reqHdrs = request.headers.get('Access-Control-Request-Headers') || '';
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': reqHdrs || 'authorization, content-type',
    'access-control-max-age': '86400',
    'vary': 'origin',
    ...extra
  };
}

function json (env, request, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(env, request, extraHeaders)
  });
}

function unauthorized (env, request) {
  // Always include CORS, even on 401
  return json(env, request, { error: 'unauthorized' }, 401, { 'www-authenticate': 'Bearer' });
}

function getBearer (request) {
  const raw = request.headers.get('authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

function hasBearer (request, token) {
  const provided = getBearer(request);
  return !!provided && provided === token;
}

// ───────────────────────────────────────────────────────────────
// Worker
// ───────────────────────────────────────────────────────────────
export default {
  async fetch (request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // 1) Handle CORS preflight for ALL routes
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    // Helpers that return Response|null
    const requireMod = () => hasBearer(request, env.MOD_READ_TOKEN) ? null : unauthorized(env, request);
    const requirePublish = () => hasBearer(request, env.PUBLISH_TOKEN) ? null : unauthorized(env, request);

    // ───────────────────────────────────────────────────────────
    // Commands
    // ───────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/api/commands') {
      const data = (await env.SITEDATA.get('commands', { type: 'json' })) ?? [];
      return json(env, request, data);
    }

    if (method === 'GET' && url.pathname === '/api/commands_mod') {
      const authErr = requireMod(); if (authErr) return authErr;
      const data = (await env.SITEDATA.get('commands_mod', { type: 'json' })) ?? [];
      return json(env, request, data);
    }

    if (method === 'POST' && url.pathname === '/api/publishCommands') {
      const authErr = requirePublish(); if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json(env, request, { error: 'invalid JSON' }, 400); }
      const { commands, commands_mod } = body || {};
      if (commands)     await env.SITEDATA.put('commands', JSON.stringify(commands));
      if (commands_mod) await env.SITEDATA.put('commands_mod', JSON.stringify(commands_mod));
      return json(env, request, { ok: true });
    }

    // ───────────────────────────────────────────────────────────
    // Stats
    // ───────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/api/stats') {
      const data = (await env.SITEDATA.get('stats', { type: 'json' })) ?? {
        totals: { updatedAt: null, songsTracked: 0, albumsTracked: 0, songReviews: 0, albumReviews: 0 },
        topSongs: [],
        topAlbums: []
      };
      return json(env, request, data);
    }

    if (method === 'POST' && url.pathname === '/api/publishStats') {
      const authErr = requirePublish(); if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json(env, request, { error: 'invalid JSON' }, 400); }
      await env.SITEDATA.put('stats', JSON.stringify(body || {}));
      return json(env, request, { ok: true });
    }

    // ───────────────────────────────────────────────────────────
    // Tables list (compat with site UI)
    // ───────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/api/tables') {
      const list = await env.SITEDATA.list({ prefix: 'db:' });
      const names = list.keys.map(k => k.name.replace(/^db:/, '')).sort();
      return json(env, request, { public: names });
    }

    if (method === 'GET' && url.pathname === '/api/tables_mod') {
      const authErr = requireMod(); if (authErr) return authErr;
      const list = await env.SITEDATA.list({ prefix: 'dbmod:' });
      const names = list.keys.map(k => k.name.replace(/^dbmod:/, '')).sort();
      return json(env, request, { mod: names });
    }

    // Combined listing: public + (if authorized) mod
    if (method === 'GET' && url.pathname === '/api/db/list') {
      const showMod = hasBearer(request, env.MOD_READ_TOKEN);
      const [pubList, modList] = await Promise.all([
        env.SITEDATA.list({ prefix: 'db:' }),
        showMod ? env.SITEDATA.list({ prefix: 'dbmod:' }) : Promise.resolve({ keys: [] })
      ]);
      const toNames = (arr, pref) => arr.keys.map(k => k.name.replace(pref, ''));
      return json(env, request, {
        public: toNames(pubList, 'db:').sort(),
        mod: showMod ? toNames(modList, 'dbmod:').sort() : []
      });
    }

    // ───────────────────────────────────────────────────────────
    // DB snapshots
    // ───────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname.startsWith('/api/db_mod/')) {
      const authErr = requireMod(); if (authErr) return authErr;
      const name = decodeURIComponent(url.pathname.substring('/api/db_mod/'.length));
      const val = await env.SITEDATA.get(`dbmod:${name}`, { type: 'json' });
      return json(env, request, val ?? []);
    }

    if (method === 'GET' && url.pathname.startsWith('/api/db/')) {
      const name = decodeURIComponent(url.pathname.substring('/api/db/'.length));
      const val = await env.SITEDATA.get(`db:${name}`, { type: 'json' });
      return json(env, request, val ?? []);
    }

    if (method === 'POST' && url.pathname === '/api/publishDb') {
      const authErr = requirePublish(); if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json(env, request, { error: 'invalid JSON' }, 400); }

      // Accepts:
      //   { tables: { name: rows, ... }, public: ['name'], privateOnly: ['name'] }
      // or { items: [{ name, data }], public: [...], privateOnly: [...] }
      const items = [];
      if (body?.tables && typeof body.tables === 'object') {
        for (const [name, data] of Object.entries(body.tables)) items.push({ name, data });
      } else if (Array.isArray(body?.items)) {
        for (const it of body.items) if (it && typeof it.name === 'string') items.push({ name: it.name, data: it.data ?? [] });
      } else {
        return json(env, request, { error: 'missing tables/items' }, 400);
      }

      const pubList = new Set(body?.public || []);
      const privateOnly = new Set(body?.privateOnly || []);

      for (const { name, data } of items) {
        const jsonStr = JSON.stringify(data ?? []);
        if (privateOnly.has(name)) {
          // mod-only
          await env.SITEDATA.put(`dbmod:${name}`, jsonStr);
        } else if (pubList.has(name)) {
          // public + mirror to mod
          await env.SITEDATA.put(`db:${name}`, jsonStr);
          await env.SITEDATA.put(`dbmod:${name}`, jsonStr);
        } else {
          // default to mod-only
          await env.SITEDATA.put(`dbmod:${name}`, jsonStr);
        }
      }
      return json(env, request, { ok: true, wrote: items.map(x => x.name) });
    }

    // ───────────────────────────────────────────────────────────
    // Health / Not found
    // ───────────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/health') {
      return new Response('ok', { status: 200, headers: corsHeaders(env, request) });
    }

    return json(env, request, { error: 'not found' }, 404);
  }
};

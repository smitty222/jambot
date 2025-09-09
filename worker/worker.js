export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const isPublish = (req.method === 'POST' && url.pathname === '/api/publish');

    // Basic CORS (allow public reads)
    const cors = {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization'
    };
    const j = (o, s=200, headers=cors) => new Response(JSON.stringify(o), { status: s, headers });

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Public GETs
    if (req.method === 'GET' && url.pathname === '/api/commands') return j(await env.SITEDATA.get('commands', { type:'json' }) ?? []);
    if (req.method === 'GET' && url.pathname === '/api/stats')    return j(await env.SITEDATA.get('stats',    { type:'json' }) ?? {});

    // Private publish (no wildcard CORS needed here)
    if (isPublish) {
      const auth = req.headers.get('authorization') || '';
      if (auth !== `Bearer ${env.PUBLISH_TOKEN}`) return j({ error:'unauthorized' }, 401);
      const body = await req.json();
      await Promise.all([
        env.SITEDATA.put('commands', JSON.stringify(body.commands ?? [])),
        env.SITEDATA.put('stats',    JSON.stringify(body.stats ?? {})),
      ]);
      return j({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  }
}

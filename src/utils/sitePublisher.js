// src/utils/sitePublisher.js
import { buildStats } from './sitePublisherStats.js' // if you have it split; else inline

export async function publishSiteSnapshot () {
  const stats = await buildStats() // ← queries your SQLite
  const r = await fetch(process.env.SITE_PUBLISH_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.SITE_PUBLISH_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ stats }) // ← publish ONLY stats
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`[publishSiteSnapshot] ${r.status} ${r.statusText} ${text}`)
  }
}

// scripts/seedAvatars.js
import fs from 'fs/promises'
import path from 'path'
import db from '../database/db.js' // Update path if needed

const filePath = path.resolve('./src/data/TT live avatars.json')

async function seedAvatars() {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const avatars = JSON.parse(raw)

    for (const avatar of avatars) {
      const slug = avatar.slug?.trim()
      if (!slug) continue

      db.prepare(`INSERT OR IGNORE INTO avatars (slug) VALUES (?)`).run(slug)
    }

    console.log('✅ Avatar slugs imported into DB')
  } catch (err) {
    console.error('❌ Failed to seed avatars:', err.message)
  }
}

seedAvatars()

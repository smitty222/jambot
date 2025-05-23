import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Needed to get __dirname in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const filePath = path.join(__dirname, 'themeStorage.json')

export function loadThemes() {
  try {
    const raw = fs.readFileSync(filePath)
    return JSON.parse(raw)
  } catch (e) {
    return {} // fallback if file missing or broken
  }
}

export function saveThemes(themes) {
  fs.writeFileSync(filePath, JSON.stringify(themes, null, 2))
}

export function getTheme(room) {
  const themes = loadThemes()
  return themes[room] || null
}

export function setTheme(room, theme) {
  const themes = loadThemes()
  themes[room] = theme
  saveThemes(themes)
}

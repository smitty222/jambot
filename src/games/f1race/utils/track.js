// src/games/f1race/utils/track.js

const TRACKS = [
  {
    key: 'street',
    name: 'Street Circuit',
    emoji: '🏙️',
    weights: { power: 0.18, handling: 0.34, aero: 0.24, tire: 0.16, reliability: 0.08 },
    dnfBase: 0.030,
    gapScale: 82, // spreads gaps a touch
    imageUrl: 'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/tracks/street.jpg'
  },
  {
    key: 'highspeed',
    name: 'High Speed',
    emoji: '🏁',
    weights: { power: 0.38, handling: 0.16, aero: 0.22, tire: 0.10, reliability: 0.14 },
    dnfBase: 0.028,
    gapScale: 74,
    imageUrl: 'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/tracks/highspeed.jpg'
  },
  {
    key: 'technical',
    name: 'Technical',
    emoji: '🧩',
    weights: { power: 0.14, handling: 0.38, aero: 0.22, tire: 0.16, reliability: 0.10 },
    dnfBase: 0.032,
    gapScale: 86,
    imageUrl: 'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/tracks/technical.jpg'
  },
  {
    key: 'balanced',
    name: 'Balanced GP',
    emoji: '🏎️',
    weights: { power: 0.24, handling: 0.24, aero: 0.22, tire: 0.18, reliability: 0.12 },
    dnfBase: 0.026,
    gapScale: 78,
    imageUrl: 'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/tracks/balanced.jpg'
  }
]

export function pickTrack () {
  // return a fresh copy so we can attach ephemeral fields (like _rc) safely
  const t = TRACKS[Math.floor(Math.random() * TRACKS.length)]
  return { ...t }
}

export function clamp01 (x) {
  return Math.max(0, Math.min(1, x))
}

export function stat01 (v) {
  const n = Number(v || 0)
  return clamp01(n / 100)
}
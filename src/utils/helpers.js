export function parseTipAmount (raw) {
  if (!raw) return NaN
  // Extract first number with up to 2 decimals: handles "$5", "5.5", "tip 10", etc.
  const m = String(raw).match(/(\d+(?:\.\d{1,2})?)/)
  if (!m) return NaN
  return Math.max(0, Math.round(parseFloat(m[1]) * 100) / 100)
}

export function randomTipGif () {
  const gifs = [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdXd5bWFsN3g5eXh3YXFqYXByZXQxejJlbzdkZDltd2V6Zmoybzh0NSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/gTURHJs4e2Ies/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdXd5bWFsN3g5eXh3YXFqYXByZXQxejJlbzdkZDltd2V6Zmoybzh0NSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l41lZccR1oUigYeNa/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3M3pyeG9jbjE1bmdqNmc5NWZtejVqY3JqNzhzN24yams1dTMwZnBmaCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/dU5n2SWrCZDhx4Y2Oe/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbTViZnUxZ2w3MnBqbDJ5ejR5aWFsdWx4c2J4aDRjMXNjZG81MjN1aSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o6gDWzmAzrpi5DQU8/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcXJidHZiZTI2YWVka2hqaXR0dGRid3Y2MGJ0bGxuM2c5cGp2YnRtbiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/MAA3oWobZycms/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcXJidHZiZTI2YWVka2hqaXR0dGRid3Y2MGJ0bGxuM2c5cGp2YnRtbiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/MAA3oWobZycms/giphy.gif'
  ]
  return gifs[Math.floor(Math.random() * gifs.length)]
}

export function splitEvenly (total, n) {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  const rem = cents % n
  const arr = Array(n).fill(base)
  for (let i = 0; i < rem; i++) arr[i] += 1
  return arr.map(c => c / 100)
}

export function naturalJoin (arr) {
  if (arr.length <= 1) return arr[0] || ''
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`
}
export async function getSenderNickname (senderUuid) {
  const id = Array.isArray(senderUuid) ? senderUuid[0] : senderUuid
  return `<@uid:${id}>`
}

export function getCurrentMonthKey (date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

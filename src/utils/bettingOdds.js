import fs from 'fs';
const FILE_PATH = 'src/libs/bettingOdds.json';

export function saveOddsForSport(sport, odds) {
  let allOdds = {};
  try {
    allOdds = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch {}
  allOdds[sport] = odds;
  fs.writeFileSync(FILE_PATH, JSON.stringify(allOdds, null, 2));
}

export function getOddsForSport(sport) {
  try {
    const allOdds = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
    return allOdds[sport] || [];
  } catch {
    return [];
  }
}

import { readFile, writeFile } from 'fs/promises'; // import readFile and writeFile from fs/promises
import path from 'path';

// Path for the derby teams file
const derbyFilePath = path.join(process.cwd(), 'src/data/derby_teams.json');

// Function to get the current derby standings
export async function getDerbyStandings() {
    try {
      const file = await readFile(derbyFilePath, 'utf8');
      const data = JSON.parse(file);
  
      const teamSummaries = data.map(team => {
        // Sort players within the team by home runs (descending)
        const sortedPlayers = [...team.players].sort((a, b) => b.homeRuns - a.homeRuns);
  
        const totalHR = sortedPlayers.reduce((sum, p) => sum + p.homeRuns, 0);
  
        return {
          name: team.name,
          totalHR,
          players: sortedPlayers.map(p => `${p.name} (${p.homeRuns})`)
        };
      });
  
      // Sort teams by total HRs (descending)
      teamSummaries.sort((a, b) => b.totalHR - a.totalHR);
  
      const standings = teamSummaries
        .map((team, i) => {
          return `🥇 Team ${team.name} — ${team.totalHR} HRs\n  - ${team.players.join('\n  - ')}`;
        })
        .join('\n\n');
  
      return `📊 **Home Run Derby Standings**\n\n${standings}`;
    } catch (err) {
      console.error('Error getting derby standings:', err);
      throw new Error('Failed to get derby standings');
    }
  }
  

// Function to update the home run totals in the derby teams
export async function updateDerbyTeamsFromJSON() {
    try {
      const raw = await readFile(derbyFilePath, 'utf8'); // Use async readFile here
      const teams = JSON.parse(raw);
  
      // Get latest HR data for all 45 players by ID
      const ids = teams.flatMap(t => t.players.map(p => p.id)).join(',');
      const url = `https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/statistics/byathlete?athleteIds=${ids}&category=batting`;
      const response = await fetch(url);
      const data = await response.json();
  
      const updatedStats = Object.fromEntries(
        data.athletes.map(player => {
          const id = player.athlete.id;
          const batting = player.categories?.find(c => c.name === 'batting');
          const homeRuns = parseInt(batting?.totals?.[7]) || 0;
          return [id, homeRuns];
        })
      );
  
      // Update HRs and totals in the original structure
      for (const team of teams) {
        for (const player of team.players) {
          player.homeRuns = updatedStats[player.id] ?? player.homeRuns;
        }
        team.totalHR = team.players.reduce((sum, p) => sum + p.homeRuns, 0);
      }
  
      await writeFile(derbyFilePath, JSON.stringify(teams, null, 2)); // Use async writeFile here
      console.log('Updated derby_teams.json with latest home run totals.');
    } catch (err) {
      console.error('Error updating derby teams:', err);
      throw new Error('Failed to update derby teams');
    }
  }

// Function to generate the derby teams (you already have this part)
export async function generateDerbyTeamsJSON() {
  const url = 'https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/statistics/byathlete?category=batting&sort=batting.homeRuns&limit=45';
  const response = await fetch(url);
  const data = await response.json();

  const players = data.athletes.map((player) => {
    const name = player.athlete.displayName ?? 'Unknown';
    const id = player.athlete.id;
    const team = player.athlete.teamShortName ?? (player.athlete.teams?.[0]?.abbreviation ?? 'UNK');
    const batting = player.categories?.find(c => c.name === 'batting');
    const homeRuns = parseInt(batting?.totals?.[7]) || 0;

    return { id, name, team, homeRuns };
  });

  // Shuffle and assign to 5 teams of 9
  const shuffled = players.sort(() => 0.5 - Math.random());
  const teams = Array.from({ length: 5 }, () => []);

  shuffled.forEach((player, i) => {
    const teamIndex = i % 5;
    teams[teamIndex].push(player);
  });

  const derbyData = teams.map((roster, i) => ({
    name: `Team ${i + 1}`,
    totalHR: roster.reduce((sum, p) => sum + p.homeRuns, 0),
    players: roster
  }));

  await writeFile(path.join(process.cwd(), 'derby_teams.json'), JSON.stringify(derbyData, null, 2));
  console.log(`Saved derby teams to derby_teams.json`);
}

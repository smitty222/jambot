# Jambot

Jambot is a feature-rich chat bot for [Turntable Live](https://hang.fm/) rooms. It grew out of a simple "artist fan bot" and now powers a full suite of interactive games, queue management, AI chat blurbs, theme controls, sports betting, and even publishes its own stats website. If you're looking for a lively companion to hang out with your community, Jambot might be what you need.

Unlike the early prototypes that shipped a single artist-focused flow, this repository contains the modern code base used by the bot running in production. It's powered by Node 20, SQLite, Redis (optional) and various third-party APIs such as Spotify, CometChat and Google's Gemini. The bot listens to room events over the Turntable Live socket, reacts to slash commands, stores state in a local database and periodically publishes data for a simple stat site.

> **Heads-up:** Runtime database files (e.g. `app.db`, `.publish-state.json`, `jackpot.json`) are *not* tracked in git. The schema is created on the fly from `src/database/initdb.js`. See [Database & runtime data](#database--runtime-data) for details.

## Features

Jambot packs a lot of functionality. Here's a non-exhaustive overview:

- **AI chat blurbs:** Primarily uses Google Gemini to generate playful descriptions of the current song/artist and answer questions when addressed. OpenAI is supported as an alternative, and Grok is available as a fallback if you have a paid Grok subscription. You can configure model order and rate limits via environment variables.
- **Games:** A suite of mini-games keeps the chat lively:
  - **Lottery** — progressive jackpot with trivia draws and persistent winner history
  - **Slots** — reel-based with configurable house rake and atomic wallet updates
  - **Blackjack** — full dealer logic with join/bet/hit/stand/double-down
  - **Roulette** — spin prediction betting
  - **Craps** — dice rolling with come/don't-come bets and configurable timers
  - **Horse Racing** — multi-horse races, horse ownership, stats, and a Hall of Fame
  - **F1 Racing** — the most complex game: car ownership across tiers (Starter, Pro, Hyper, Legendary), team garages, qualifying, race simulation, damage/repair mechanics, and tiered payouts
  - **Trivia** — music/general knowledge rounds with integrated betting
  - **Song Chain** — guess artist names in a chain from song clues
- **Queue management:** Users can join or leave the DJ queue, advance when the current DJ leaves and view their position. The queue persists across restarts in the `dj_queue` table.
- **Theme & room design:** Moderators can set themes (e.g. Albums, Covers, Rock, Country, Rap, Name Game) that influence which songs are allowed. Commands also swap room backdrops between classic, ferry, barn, theater, festival, stadium and yacht designs.
- **Now-playing blurbs:** The bot can announce the currently playing song with varying tones (neutral, playful, crate digger, hype, classy, chart bot, DJ tech, vibe). These blurbs can be toggled on/off and configured by mods.
- **Tips & wallets:** A simple wallet system lets users tip one another, place bets on games, accrue winnings and check their balances. Winnings are persisted and can be transferred via `/tip` commands. A prestige system rewards long-term players with unlockable bonuses.
- **Sports betting:** Users can bet on live sporting events via the Odds API, with automated settlement via a cron job. March Madness (NCAA tournament) is supported with full bracket tracking, bet management and cron-driven score updates.
- **Site publisher:** A cron job (disabled by default) runs `tools/publish-site-data.mjs` at scheduled intervals, publishing JSON snapshots of commands, database stats, top songs, wrapped data, lottery winners and game leaderboards to a remote site. See `src/scheduler/sitePublisher.js` for details.

## Getting started

### Installation

```sh
git clone <your-repo-url>
cd jambot
npm install
```

Jambot uses [`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3) for its runtime database, so local installs need a working native Node module build for your current Node 20 runtime. On this machine, for example, `node -p "process.versions.modules"` reports ABI `115`. If the native binding is missing or built for a different ABI, the app will fall back to a no-op DB stub so non-DB code can still boot, but wallet and persistence features will not function.

If you hit `Could not locate the bindings file` or ABI mismatch errors:

- Rebuild from a real path without spaces if possible.
- Make sure you are using Node 20.x, matching `package.json`.
- Reinstall or rebuild `better-sqlite3` after changing Node versions.
- Run `npm run sqlite:doctor` for a local environment check and rebuild guidance.

To run the bot locally in development mode, create a `.env` file with your secrets (use `.env.example` as a template) and execute:

```sh
npm run dev
```

This will start the bot with nodemon so it automatically restarts on file changes. For production, build your own container image using the provided `Dockerfile` or deploy to Fly.io with `fly.toml`.

### Configuration

Jambot relies on many environment variables to talk to external services. A sample `.env.example` file is provided with placeholders and comments. At minimum you'll need:

| Variable | Required | Description |
| --- | --- | --- |
| `CHAT_API_KEY` | ✔️ | CometChat App ID for the Turntable Live chat API |
| `CHAT_TOKEN` | ✔️ | CometChat auth token for your bot user |
| `CHAT_USER_ID` | ✔️ | The UUID of your bot (prevents it from replying to itself) |
| `ROOM_UUID` | ✔️ | Target room ID to join |
| `TTL_USER_TOKEN` | ✔️ | JWT used to authenticate against Turntable Live sockets |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | optional | API keys for generating AI blurbs |
| `GROK_API_KEY` | optional | Grok API key — fallback AI model, requires a paid Grok subscription |

Other variables configure optional features: Spotify credentials (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`), Genius and Last.fm tokens, `ODDS_API_KEY` for sports bets, site publishing schedule, and many tunables controlling game timers, F1 entry fees, AI rate limits, logging and more. See `src/config.js` for the full list and default values. All required variables are validated at startup; missing secrets will cause the bot to exit with a helpful message.

For user-scoped Spotify/queue commands, keep per-user TT Live tokens in environment variables such as `IAN_USER_TOKEN`, `SMITTY_USER_TOKEN`, `CAM_USER_TOKEN`, `GAB_USER_TOKEN` and `ALEX_USER_TOKEN`. These should be treated as secrets and must not be hardcoded in source control.

### Commands

Slash commands trigger most of Jambot's functionality. Commands are grouped roughly into:

- **Games:** `/lottery`, `/slots <amount>`, `/blackjack`, `/roulette`, `/horserace`, `/trivia`, `/craps`, `/f1race` and various game actions such as `/hit`, `/stand`, `/horse1 50`, `/bet`, `/roll`, etc.
- **Sports:** `/sportsbet`, `/mybets`, `/marchbet`, `/bracket`, `/standings` and related commands for live odds and tournament tracking.
- **Fun & gifs:** `/dance`, `/party`, `/beer`, `/props`, `/burp`, `/cheers`, `/dog`, `/fart`, `/shred`, `/tomatoes` and many more.
- **Money:** `/balance`, `/bankroll`, `/getwallet`, `/tip <amount>`, `/prestige` and the progressive `/jackpot`.
- **Reviews & stats:** `/songreview <1–10>`, `/albumreview <1–10>`, `/rating`, `/topsongs`, `/topalbums`, `/mytopalbums`, `/stats`, `/topliked`.
- **Room & theme management:** `/room <classic|ferry|barn|yacht|festival|stadium|theater>`, `/settheme <Albums|Covers|Rock|Country|Rap|Name Game>`, `/removetheme`.
- **Bot toggles:** `/status`, `/bopon`/`/bopoff`, `/autodjon`/`/autodjoff`, `/songstatson`/`off`, `/greeton`/`off`, `/infoon`/`/infooff`, `/infotone <tone>`.

The full list of commands is generated at runtime and can be published to your site via the scheduler. Inspect `tools/publish-site-data.mjs` for details.

## Database & runtime data

Jambot persists state in a SQLite database (`app.db`) and a handful of JSON snapshot files. These files are **not** version controlled — they are listed in `.gitignore` so you don't accidentally commit your production wallets or jackpots. When the bot starts it runs migrations defined in `src/database/initdb.js` to create all tables.

Key tables include:

| Table(s) | Purpose |
| --- | --- |
| `users` | User profiles, balances, lifetime net |
| `dj_queue` | DJ queue state (persists across restarts) |
| `themes` | Room theme preferences |
| `lottery_winners`, `recent_songs`, `room_stats`, `song_reviews`, `song_plays`, `album_stats`, `album_reviews` | Music tracking and ratings |
| `horses`, `horse_hof` | Horse racing ownership and Hall of Fame |
| `cars`, `f1_results`, `teams` | F1 car ownership, race results, team data |
| `march_madness_*` | NCAA bracket and bet tables |

When deploying to Docker or Fly.io you should mount a persistent volume at `/data` to ensure the database and publish state survive restarts. See `fly.toml` for an example.

## hang.fm API

The bot integrates with hang.fm's backend services via the API gateway at `https://gateway.prod.tt.fm`. Swagger documentation for each service is available at:

| Service | URL |
| --- | --- |
| User Service (auth tokens, user profiles) | https://gateway.prod.tt.fm/api/user-service/api/# |
| Playlist Service | https://gateway.prod.tt.fm/api/playlist-service/api/# |
| Room Service | https://gateway.prod.tt.fm/api/room-service/api/# |

The user service is where you obtain auth tokens for your bot account. Set the resulting JWT as `TTL_USER_TOKEN` in your `.env`.

## Contributing & maintenance

- **Code style:** This project uses [JavaScript Standard Style](https://standardjs.com/). Run `npm run lint` to check for issues and `npm run lint:fix` to automatically format your changes.
- **Testing:** Run `npm test` for the full suite. If native SQLite bindings are unavailable, the DB-backed tests will skip automatically. Use `npm run test:portable` for the non-DB suite only, and `npm run test:db` when you specifically want to validate wallet and slot atomicity behavior against a real `better-sqlite3` build.
- **Native SQLite setup:** On macOS, `npm run sqlite:doctor` prints the current Node ABI, checks whether the `better-sqlite3` binding is present, and suggests a rebuild path. This is the quickest way to diagnose the common "bindings file" and ABI mismatch failures.
- **Architecture:** All incoming chat messages flow through `src/handlers/message.js` into a conditional pipeline, then dispatch to individual command handlers via `src/handlers/commandRegistry.js`. Games are isolated in `src/games/` (each with its own manager, simulation, handlers and assets), database access goes through specialized managers in `src/database/`, and utilities live in `src/utils/`.

## License

MIT — see the [LICENSE](./LICENSE) file for details.

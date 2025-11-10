# Jambot

Jambot is a feature‑rich chat bot for [Turntable Live](https://tt.live/) rooms. It grew out of a simple “artist fan bot” and now powers a full suite of interactive games, queue management, AI chat blurbs, theme and avatar controls and even publishes its own website with room stats. If you're looking for a lively companion to hang out with your community, Jambot might be what you need.

Unlike the early prototypes that shipped a single artist‐focused flow, this repository contains the modern code base used by the bot running in production. It's powered by Node 20, SQLite, Redis (optional) and various third‑party APIs such as Spotify, CometChat and Google's Gemini. The bot listens to room events over the Turntable Live socket, reacts to slash commands, stores state in a local database and periodically publishes data for a simple stat site.

> **Heads‑up:** Runtime database files (e.g. `app.db`, `.publish-state.json`, `jackpot.json`) are *not* tracked in git. The schema is created on the fly from `src/database/initdb.js` and seeded by `src/database/seedavatars.js`. See [Database & runtime data](#database--runtime-data) for details.

## Features

Jambot packs a lot of functionality. Here's a non‑exhaustive overview:

- **AI chat blurbs:** Integrates with Google Gemini and OpenAI to generate playful descriptions of the current song/artist and answer questions when addressed.  You can configure model order and rate limits via environment variables.
- **Games:** A suite of mini‑games keeps the chat lively.  The bot supports a lottery with stats and a progressive jackpot, slots, trivia rounds, blackjack with join/bet logic, roulette, horse racing (including race entry, betting, horse ownership and stats), craps, a song chain game and more.  Games share a common wallet stored in SQLite.
- **Queue management:** Users can join or leave the DJ queue, advance when the current DJ leaves and view their position. The queue persists across restarts in the `dj_queue` table.
- **Theme & room design:** Moderators can set themes (e.g. Albums, Covers, Rock, Country, Rap, Name Game) that influence which songs are allowed. There are also commands to swap room backdrops between classic, ferry, barn, theater, festival, stadium and yacht designs.
- **Avatar commands:** A large catalogue of avatars are available for both the bot and users. Slash commands allow switching between dinos, ducks, aliens, penguins, walruses, cosmic characters and more. Random avatars keep things fresh.
- **Now‑playing blurbs:** The bot can announce the currently playing song with varying tones (neutral, playful, crate digger, hype, classy, chart bot, DJ tech, vibe).  These blurbs can be toggled on/off and configured by mods.
- **Tips & wallets:** A simple wallet system lets users tip one another, place bets on games, accrue winnings and check their balances.  Winnings are persisted and can be transferred via `/tip` commands.
- **Site publisher:** A cron job (disabled by default) runs `tools/publish-site-data.mjs` at scheduled intervals, publishing JSON snapshots of commands, database stats and top songs to a remote site.  See `src/scheduler/sitePublisher.js` for details.

## Getting started

### Installation

```sh
git clone https://github.com/smitty222/jambot.git
cd jambot
npm install
```

To run the bot locally in development mode, create a `.env` file with your secrets and execute:

```sh
npm run dev
```

This will start the bot with nodemon so it automatically restarts on file changes.  For production, build your own container image using the provided `Dockerfile` or deploy to Fly.io with `fly.toml`.

### Configuration

Jambot relies on many environment variables to talk to external services. A sample `.env.clean` file is provided with placeholders and comments. At minimum you'll need:

| Variable | Required | Description |
| --- | --- | --- |
| `CHAT_API_KEY` | ✔️ | CometChat App ID for the Turntable Live chat API |
| `CHAT_TOKEN` | ✔️ | CometChat auth token for your bot user |
| `CHAT_USER_ID` | ✔️ | The UUID of your bot (prevents it from replying to itself) |
| `ROOM_UUID` | ✔️ | Target room ID to join |
| `TTL_USER_TOKEN` | ✔️ | JWT used to authenticate against Turntable Live sockets |
| `GEMINI_API_KEY`/`OPENAI_API_KEY` | optional | API keys for generating AI blurbs |

Other variables configure optional features: Spotify credentials (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`), Genius and Last.fm tokens, odds API key for sports bets, site publishing schedule and many tunables controlling game timers, AI rate limits, logging and more.  See `src/config.js` for the full list and default values.  All required variables are validated at startup; missing secrets will cause the bot to exit with a helpful message.

### Commands

Slash commands trigger most of Jambot’s functionality. Commands are grouped roughly into:

- **Games:** `/lottery`, `/slots <amount>`, `/blackjack`, `/roulette`, `/horserace`, `/trivia`, `/craps` and various bets/actions such as `/hit`, `/stand`, `/horse1 50`, etc.
- **Fun & gifs:** `/dance`, `/party`, `/beer`, `/props`, `/burp`, `/cheers`, `/dog`, `/fart`, `/shred`, `/tomatoes` and many more.
- **Money:** `/balance`, `/bankroll`, `/getwallet`, `/tip <amount>` and the progressive `/jackpot`.
- **Reviews & stats:** `/songreview <1–10>`, `/albumreview <1–10>`, `/rating`, `/topsongs`, `/topalbums`, `/mytopalbums`, `/stats`, `/topliked`.
- **Room & theme management:** `/room <classic|ferry|barn|yacht|festival|stadium|theater>`, `/settheme <Albums|Covers|Rock|Country|Rap|Name Game>`, `/removetheme`.
- **Bot toggles:** `/status`, `/bopon`/`/bopoff`, `/autodjon`/`/autodjoff`, `/songstatson`/`off`, `/greeton`/`off`, `/infoon`/`/infooff`, `/infotone <tone>`.

The full list of commands is generated at runtime and can be published to your site via the scheduler. Inspect `tools/publish-site-data.mjs` for details.

## Database & runtime data

Jambot persists state in a SQLite database (`app.db`) and a handful of JSON snapshot files under `src/data/`. These files are **not** version controlled — they are listed in `.gitignore` so you don't accidentally commit your production wallets or jackpots. When the bot starts it runs migrations defined in `src/database/initdb.js` to create tables such as `users`, `dj_queue`, `lottery_stats` and `jackpot`, then seeds avatars via `src/database/seedavatars.js`. Feel free to inspect these scripts if you wish to understand the schema or run your own migrations.

When deploying to Docker or Fly.io you should mount a persistent volume at `/data` to ensure the database and publish state survive restarts. See `fly.toml` for an example of how to do this.

## Contributing & maintenance

- **Code style:** This project uses [JavaScript Standard Style](https://standardjs.com/). Run `npm run lint` to check for issues and `npm run lint:fix` to automatically format your changes. A CI job will enforce linting on pull requests.
- **Testing:** Mocha and Chai are configured with [`nyc`](https://istanbul.js.org/) for coverage. To run tests execute `npm test`. At present the test suite is small; contributions are welcome! See `test/` for examples.
- **Architecture:** Core logic lives in `src/handlers/message.js`, which routes incoming chat messages to individual command handlers. Over time we recommend refactoring toward a plugin‑style architecture where each command is its own module under `src/commands/` or `src/games/` to reduce complexity and avoid circular dependencies.

## License

MIT — see the [LICENSE](./LICENSE) file for details.
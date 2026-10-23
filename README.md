**English** · [Nederlands](README.nl.md)

# WoD Bot — Truth or Dare

A Discord bot for Truth or Dare (*Waarheid of Doen*), with profiles, levels and achievements, and an admin panel to manage everything per server.

- **Game:** `/wod` with Truth, Dare and Random buttons, plus Reroll, Pass (penalty question) and New round. Only the player whose turn it is can use the buttons of their round. Or ask a question directly with `/waarheid` and `/doen`
- **Turn rotation:** add players and pass the turn along with `/beurt`
- **Sessions:** several sessions per server, per channel. Questions don't repeat within a session; pause, resume and switch with `/sessie`
- **Never have I ever…:** vote with buttons, with custom statements per server
- **Profiles:** points, 8 levels, achievements and a leaderboard per server
- **Fun:** love language test, personality test and a relationship test with another player
- **Questions:** categories (algemeen, vrienden, koppels, feest, 18+), category per channel, DM mode, duplicate check, CSV import and export
- **Admin panel:** Discord login, management per server, Dutch and English

> **Language:** the messages in Discord are currently **Dutch only**. The admin panel is available in Dutch and English. English Discord messages are planned.

Stack: Node.js 22, discord.js v14, Express, SQLite (better-sqlite3), React + Vite.

---

## Content and 18+

The bot comes without built-in questions. Every server adds its own questions and dares, including 18+ content if it wants to. The administrators of a server are responsible for its content and for who plays along.

Every question has a category: `algemeen` (general), `vrienden` (friends), `koppels` (couples), `feest` (party) or `18+`. With **Categories per chat** (Settings) you link a channel to a single category. That channel then only shows questions from that category, without exceptions:

- If the category has no questions of the chosen type, you get a message instead of a question from another category.
- Once every question in the category has been used, the category starts over.
- `/waarheid nummer:` and `/doen nummer:` use the numbers from `/lijst`, but refuse a question from another category in a linked channel.
- This also applies in DM mode.

Every question shows its category in the footer, e.g. `🔞 18+ • 3/40 vragen gehad`. For 18+ the title shows 🔞 as well. In a linked channel the counter only counts questions from that category.

Without links, all categories are mixed in every channel, 18+ included. To keep 18+ separate, link a dedicated channel to `18+` and the other channels to the other categories.

---

## Setting up the Discord application

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. **Bot:** create a bot and copy its token (`DISCORD_TOKEN`). No privileged intents are needed.
2. **OAuth2:** copy the Client ID and Client Secret (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`) and add this redirect: `<PANEL-URL>/auth/callback`.
3. **Invite:** add the bot with the scopes `bot` and `applications.commands` and at least these permissions:
   View Channels, Send Messages, Embed Links, Read Message History.
   To use the "Create category folders" button in the panel, also grant Manage Channels.

Slash commands are registered globally on every start. After a first installation it can take a while before they show up everywhere.

---

## Quick start (Docker Compose)

The image is published as `ghcr.io/hendriebuilds/wod`.

1. Create a `.env` file from [`.env.example`](.env.example) and fill in the values. Generate `SESSION_SECRET` with `openssl rand -hex 32`.
2. Set `PANEL_URL` to the public HTTPS address of your panel, e.g. `https://panel.example.com`.
3. Create a `docker-compose.yml`:

```yaml
services:
  wod:
    image: ghcr.io/hendriebuilds/wod:latest
    restart: unless-stopped
    env_file: .env
    ports:
      - "3001:3001"
    volumes:
      - wod_data:/app/data

volumes:
  wod_data:
```

4. Start it with `docker compose up -d`.

Any Docker host works. On Unraid, for example, you add the same image, variables and a path for `/app/data` in the Docker tab.

---

## Reverse proxy and HTTPS

Put the panel behind a reverse proxy with HTTPS and use that address as `<PANEL-URL>`.

- **HTTPS and `X-Forwarded-Proto`:** if `frontendUrl` starts with `https://`, the session cookie is `Secure`. The reverse proxy must then send the `X-Forwarded-Proto` header; without it logging in fails (you keep landing on the login screen). Whether the cookie is `Secure` is decided at startup: restart the container after changing `frontendUrl`.
- **Always through `<PANEL-URL>`:** saving, deleting and logging out only work when the panel is opened at the address in `frontendUrl` (CSRF protection: the API checks the `Origin`). Through another address (e.g. directly on the port) you can look around, but not change anything; you get a 403.
- **Restart policy:** use `unless-stopped` or `always`. On an unexpected error (`uncaughtException`) the bot stops on purpose, so Docker restarts it cleanly.
- **Staying logged in:** panel sessions are stored in `bot.db`, so restarting or updating the container doesn't log you out. A session expires after 24 hours.
- **Production mode:** the image sets `NODE_ENV=production`. API errors are always returned as JSON, never as an HTML page with a stack trace.
- **Healthcheck:** every 30 seconds the image checks `GET /health` on `ADMIN_PORT` inside the container. It returns `200 {"status":"ok"}` once the bot is connected to Discord, `503` before that. The route gives no further details.
- **Graceful shutdown:** on `docker stop` (SIGTERM) the bot saves the sessions, closes the web server, the Discord connection and the database, and stops within 8 seconds.
- **Startup check:** the bot doesn't start when a required variable is missing or `SESSION_SECRET` is shorter than 32 characters. The log names the variable.

---

## Configuration

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `DISCORD_TOKEN` | Bot token | required |
| `DISCORD_CLIENT_ID` | OAuth2 client ID (Application ID) | required |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret | required |
| `SESSION_SECRET` | Random string for sessions, **at least 32 characters** | required |
| `PANEL_URL` | Public URL of the panel, e.g. `https://panel.example.com`. Only used when the data folder has no `config.json` yet | empty |
| `SUPERADMIN_IDS` | Discord user IDs with access to every server, comma-separated | empty |
| `ADMIN_PORT` | Port of the panel and API | `3001` |
| `DATA_DIR` | Folder for `bot.db` and `config.json` | `./data`, `/app/data` in the container |

### `config.json` in the data folder

The panel's login settings are stored in `config.json` in the data folder (`/app/data/config.json` in the container):

```json
{
  "redirectUri": "https://panel.example.com/auth/callback",
  "frontendUrl": "https://panel.example.com"
}
```

On startup the bot works like this:

1. **`config.json` exists in the data folder:** the bot uses it. If `PANEL_URL` is also set and differs, the log says `PANEL_URL` is ignored.
2. **No `config.json`, but `PANEL_URL` is set:** the bot creates `config.json` with `frontendUrl = PANEL_URL` and `redirectUri = PANEL_URL/auth/callback`. An invalid `PANEL_URL` stops the bot with a clear message.
3. **Neither:** the panel uses `http://localhost:3001` and the log shows a warning. Logging in through any other address won't work.

Superadmins can change both URLs in the panel under **Configuration**; that writes to the same file. `redirectUri` must match the redirect in the Developer Portal exactly, otherwise Discord answers "Invalid redirect_uri". See [`config.example.json`](config.example.json) for an example.

---

## First-time setup

1. Start the container and invite the bot to your server.
2. Log in to the panel at `<PANEL-URL>`. You see the servers the bot is in and where you have **Manage Server**. Superadmins see every server.
3. Add questions under **Vragen** (one by one or with a CSV import), and optionally your own statements under **Nooit**.
4. Under **Settings**, choose the cooldown and DM mode. For categories per channel, link channels or let the panel create category folders.
5. Start a game in Discord with `/wod`.

### CSV import

An import file can be up to about 2 MB. The columns `type` (`waarheid` or `doen`) and `tekst` are required. `categorie` is optional (default `algemeen`) and must be `algemeen`, `vrienden`, `koppels`, `feest` or `18+` (case-insensitive). Rows with an unknown type, empty text, text over 500 characters or an unknown category count as invalid and are skipped. Duplicate questions (case-insensitive) are skipped. After the import you see how many questions were added, skipped and invalid.

```csv
type,tekst,categorie
waarheid,"Wat is je grootste guilty pleasure?",vrienden
doen,"Doe je beste imitatie van iemand in dit kanaal",feest
```

Existing questions with a category outside this list keep working. The panel marks them with ⚠️; choose a valid category when you edit them.

### Maximum length

A question or dare can be at most 500 characters, a "Never have I ever…" statement at most 300. This applies in the panel, the CSV import, `/voeg-toe` and `/nooit stelling:`. Longer existing texts stay and are shown shortened in Discord (ending in `…`). In the panel you can only save them after shortening them.

---

## Slash commands

### Game
| Command | Description |
|---|---|
| `/wod [speler]` | Start a round for a player: the given player, otherwise whoever's turn it is in `/beurt`, otherwise yourself |
| `/waarheid [nummer]` | A truth question right away, or a specific one by its number from `/lijst` |
| `/doen [nummer]` | A dare right away, or a specific one by its number |
| `/beurt toevoegen\|lijst\|volgende` | Turn rotation: add a player, show the list, move to the next player |
| `/beurt verwijder\|reset` | Remove a player from the rotation or clear it (Manage Server only) |
| `/nooit [stelling]` | A "Never have I ever…" round; without a statement the bot picks one |
| `/statistieken` | Statistics of the session in this channel |

### Profiles
| Command | Description |
|---|---|
| `/profiel [speler]` | Profile with level, points and achievements |
| `/ranglijst` | Top 10 of this server |
| `/achievements` | Your achievements |

### Fun
| Command | Description |
|---|---|
| `/liefdestaal` | Love language test (10 questions) |
| `/persoonlijkheid` | Personality test (9 questions) |
| `/relatietest speler` | Test how well you match with another player |

### Management (Manage Server only)
The bot checks *Manage Server* itself, even when the command permissions on the server have been changed. This also applies to the confirmation button of `/verwijder`.

| Command | Description |
|---|---|
| `/voeg-toe type tekst categorie` | Add a question or dare in the chosen category |
| `/verwijder type nummer` | Delete a question or dare, with confirmation |
| `/lijst [type]` | All questions with their numbers |
| `/reload` | Reset the used questions of the session in this channel |
| `/reset` | End the session in this channel |
| `/sessie starten\|lijst\|wisselen\|pauzeren\|hervatten\|stoppen\|info` | Manage sessions |
| `/strafpunten speler aantal reden` | Deduct 1–100 points as a penalty; the bot posts a message in the channel (without a ping) |

---

## Points and levels

| Action | Points |
|---|---|
| Choose Truth, Dare or Random | +5 |
| Finish a round (New round) | +5 |
| Reroll | −5 |
| Pass | −7 |
| Vote in `/nooit` | +3, once per vote |
| Finish `/relatietest` | +15 (both players), once per pair per day |
| `/strafpunten` (admin) | −1 to −100 |

Starting a round with `/wod` gives no points. Only the player of the round can choose, reroll, pass and start a new round, and only that player gains or loses points. A played round is worth +10 net. Reroll and Pass only cost points when there is a new question.

After **New round** the bot shows who answered and whose turn it is now. With a rotation (`/beurt`) that is the next player; without one, the round is open and the first player to choose takes the turn.

Points never go below 0. A message appears in the channel when a player reaches a new level.

| Level | Title | Points |
|---|---|---|
| 1 | Lafaard | 0–49 |
| 2 | Deelnemer | 50–149 |
| 3 | Durfal | 150–349 |
| 4 | Avonturier | 350–699 |
| 5 | Onthulling | 700–1199 |
| 6 | Verleider | 1200–1999 |
| 7 | Kampioen | 2000–3499 |
| 8 | Legenda | 3500+ |

### Achievements

| Achievement | How |
|---|---|
| 👣 Eerste stap | Receive points for the first time |
| 💪 Durfal | Reach level 3 (Durfal) |
| 🔓 Onthullingsmaster | Reach level 5 (Onthulling) |
| 👑 Legenda | Reach level 8 (Legenda) |
| 🎲 Reroll addict | Reroll 10 times |
| 😅 Schijterd | Pass 5 times |
| 🔥 Op dreef | Finish 3 rounds |
| 💑 Lovebird | Finish `/relatietest` |
| 🧠 Zelfinzicht | Finish `/liefdestaal` or `/persoonlijkheid` |

---

## Admin panel

| Page | What you do there |
|---|---|
| **Vragen** (Questions) | Add, edit and delete questions; category and DM mode per question; CSV import and export |
| **Nooit** | Custom "Never have I ever…" statements |
| **Sessies** (Sessions) | View and end all sessions |
| **Statistieken** (Statistics) | Number of questions and active sessions, rerolls per player, reset and reload |
| **Ranglijst** (Leaderboard) | Top 10 with points, level and achievements |
| **Instellingen** (Settings) | Cooldown, DM mode, category per channel, create category folders, reset everything |
| **Configuratie** (Configuration) | Superadmins only: redirect URI and frontend URL of the login |
| **Servers** | Superadmins only: all servers, switch, make the bot leave |

Switch between Dutch and English at the bottom of the sidebar.

Every minute the panel checks again whether you still have *Manage Server* on the active server. If you lose it, the panel switches to another server, or to the login screen when none is left.

---

## Updating and backups

```bash
docker compose pull && docker compose up -d
```

Everything the bot stores is in the data folder: `bot.db` (questions, sessions, points, settings) and `config.json`. Back up the whole folder `/app/data`, for example:

```bash
docker compose stop wod
docker cp "$(docker compose ps -aq wod)":/app/data ./wod-backup-$(date +%F)
docker compose start wod
```

See [`CHANGELOG.md`](CHANGELOG.md) for what changed in each version and for upgrade notes.

---

## Local development

Requires Node.js 22.

```bash
npm ci
cp .env.example .env        # fill in the values; use PANEL_URL=http://localhost:3001

cd admin
npm ci
npm run build               # required: the bot serves admin/dist, which is not in git
cd ..

npm start                   # bot + API on port 3001, database and config.json in ./data

cd admin && npm run dev     # optional: panel with hot reload; /api and /auth go to port 3001
```

Use `npm ci` so you get exactly the versions from the lock files. Only use `npm install` when adding or updating a package, and commit the updated `package-lock.json`.

Preferably use a separate test bot and test server, so your real servers aren't affected. For logging in locally, add the redirect `http://localhost:3001/auth/callback` in the Developer Portal.

Because of the CSRF check, `frontendUrl` must match the address where you open the panel: `http://localhost:3001` for the built panel, or `http://localhost:5173` when you use the Vite dev server (`npm run dev`). Otherwise saving and logging out return a 403. Change it under Configuration or in `data/config.json`.

---

## Security and license

Found a vulnerability? See [`SECURITY.md`](SECURITY.md).

MIT, see [`LICENSE`](LICENSE).

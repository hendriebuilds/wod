# WoD Bot — Waarheid of Doen Discord Bot v1.8.0

Een Discord bot voor het spel Waarheid of Doen, met profielen, levels en achievements.

## Slash Commands

### Spel
| Command | Beschrijving |
|---|---|
| `/wod` | Start een ronde Waarheid of Doen |
| `/waarheid` | Krijg direct een waarheidsvraag |
| `/doen` | Krijg direct een doe-opdracht |
| `/beurt` | Beheer de beurtrotatie |
| `/nooit` | Start een ronde 'Nooit heb ik...' |
| `/statistieken` | Bekijk sessiestatistieken |

### Profielen & Levels
| Command | Beschrijving |
|---|---|
| `/profiel` | Bekijk jouw profiel of dat van een andere speler |
| `/ranglijst` | Bekijk de top 10 van deze server |
| `/achievements` | Bekijk jouw behaalde achievements |

### Fun
| Command | Beschrijving |
|---|---|
| `/liefdestaal` | Doe een liefdestaaltest |
| `/persoonlijkheid` | Doe een persoonlijkheidstest |
| `/relatietest` | Test hoe goed jij en een andere speler bij elkaar passen |

### Admin
| Command | Beschrijving |
|---|---|
| `/voeg-toe` | Voeg een vraag of opdracht toe |
| `/verwijder` | Verwijder een vraag of opdracht |
| `/lijst` | Bekijk alle vragen en opdrachten |
| `/reload` | Reset de gebruikte vragen |
| `/reset` | Reset sessie en statistieken |
| `/sessie` | Beheer spelsessies |

## Puntensysteem

| Actie | Punten |
|---|---|
| Ronde starten (`/wod`) | +5 |
| Ronde voltooien (nieuwe ronde knop) | +10 |
| Reroll | -1 |
| Passen | -3 |
| Stemmen in `/nooit` | +3 |
| `/relatietest` voltooien | +15 (beide spelers) |

### Levels
| Level | Naam | Punten |
|---|---|---|
| 1 | Lafaard | 0–49 |
| 2 | Durfal | 50–149 |
| 3 | Onthullingsmaster | 150–299 |
| 4 | Legenda | 300+ |

## Projectstructuur

```
wod/
├── src/
│   ├── commands/
│   │   ├── admin/        # Admin slash commands
│   │   ├── game/         # Game slash commands
│   │   └── fun/          # Fun slash commands
│   ├── database.js       # DB setup, schema, stmts
│   ├── embeds.js         # Embed builders
│   ├── game.js           # Game logic, sessies, levels
│   ├── server.js         # Express API server
│   ├── buttons.js        # Button interaction handlers
│   └── config.js         # Config laden/opslaan
├── admin/                # React (Vite) admin panel
├── index.js              # Discord client + event dispatcher
├── config.json
├── Dockerfile
└── package.json
```

## Tech Stack
- **Runtime**: Node.js (ESM)
- **Discord**: discord.js v14
- **Database**: better-sqlite3
- **Admin panel**: Express + React (Vite)
- **Deployment**: Docker, GitHub Container Registry

## Links

- **GitHub**: <https://github.com/hendriebuilds/wod>
- **Docker image**: `ghcr.io/hendriebuilds/wod`

## Docker

Image pullen en draaien:

```sh
docker pull ghcr.io/hendriebuilds/wod:latest
```

Zelf bouwen en pushen:

```sh
./build-and-push.sh
```

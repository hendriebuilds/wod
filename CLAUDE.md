# Claude Code — WoD Bot instructies

## Versiebeheer
- Semantic versioning (MAJOR.MINOR.PATCH)
- Pas versienummer aan in package.json na elke sessie
- Vermeld versienummer in commit message
- Voorbeeld: feat: profielen en scores — v1.7.0
- Voorbeeld: fix: reroll knop crash — v1.6.1

## Tech stack — nooit afwijken
- Runtime: Node.js
- Discord: discord.js v14
- Database: better-sqlite3
- Admin panel: Express + React (Vite)
- Deployment: Docker, GitHub Container Registry

## Projectstructuur
wod/
├── admin/                  # React (Vite) admin panel
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── api.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── Updateplannen/
├── build-push.sh
├── config.json
├── Dockerfile
├── index.js
├── package.json
└── README.md

## Werkwijze
- Features zijn uitgewerkt via Claude — lees het plan goed door
- Stel vragen als iets onduidelijk is — ga niet gokken
- Implementeer, test, verhoog versienummer
- Commit met versienummer in de message
- Sla technische plannen op in Updateplannen/
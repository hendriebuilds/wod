# WoD Bot v1.7.0 — Technisch Plan

Implementeer WoD Bot v1.7.0 volgens onderstaande fases. Werk de fases **in volgorde** af.
Commit aan het einde van elke fase. Stel vragen als iets onduidelijk is — ga niet gokken.

---

## Fase 1 — Refactor: index.js opsplitsen naar src/

### Doel
index.js is momenteel één groot bestand met database, commands, embeds, game logic en Express server.
Splits dit op in modules zonder enige functionaliteit te wijzigen. De bot moet na deze fase identiek werken.

### Nieuwe projectstructuur
```
wod/
├── src/
│   ├── commands/
│   │   ├── admin/
│   │   │   ├── voeg-toe.js
│   │   │   ├── verwijder.js
│   │   │   ├── lijst.js
│   │   │   ├── reload.js
│   │   │   ├── reset.js
│   │   │   └── sessie.js
│   │   ├── game/
│   │   │   ├── wod.js
│   │   │   ├── waarheid.js
│   │   │   ├── doen.js
│   │   │   ├── beurt.js
│   │   │   ├── nooit.js
│   │   │   └── statistieken.js
│   │   └── fun/
│   │       ├── liefdestaal.js
│   │       ├── persoonlijkheid.js
│   │       └── relatietest.js
│   ├── database.js       # db setup, schema, migraties, stmts, dbGetInstellingen
│   ├── embeds.js         # alle build*Embed functies
│   ├── game.js           # sessieCache, beurtrotatie, getVraag, cooldown, categoriefilter
│   ├── server.js         # Express app + alle API routes
│   └── config.js         # laadConfig, slaConfigOp, isSuperAdmin
├── admin/                # ongewijzigd
├── index.js              # alleen: imports, client setup, command loader, event dispatcher, client.login
├── config.json
├── Dockerfile
├── package.json
└── README.md
```

### Command loader patroon (index.js)
```js
// Laad alle commands dynamisch
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const commandMap = new Map();

const categories = ['game', 'fun', 'admin'];
for (const cat of categories) {
  const dir = join(__dirname, 'src', 'commands', cat);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const mod = await import(join(dir, file));
    commandMap.set(mod.data.name, mod);
  }
}
```

Elk command-bestand exporteert:
- `export const data` — SlashCommandBuilder
- `export async function execute(interaction, { db, stmts, game, embeds })` — handler

### Wat in index.js blijft
- Discord client aanmaken
- Command loader (zie boven)
- `client.once('ready', ...)` — command registratie + guild sync
- `client.on('interactionCreate', ...)` — dispatcht naar commandMap
- `client.on('guildCreate/Delete/Update', ...)`
- `client.login(...)`
- Server starten via `import './src/server.js'`

### Commit
`refactor: splits index.js op in src/ modules — v1.7.0-fase1`

---

## Fase 2 — Config opschonen

### Doel
`settings.json` en `config.json` samenvoegen tot één `config.json`. settings.json bevat cooldown en dm_modus die al in SQLite zitten — die migratie bestaat al. config.json bevat redirectUri en frontendUrl. Na deze fase is settings.json volledig overbodig.

### Wijzigingen
- Verwijder alle verwijzingen naar `INSTELLINGEN_PAD` / `settings.json` uit `src/config.js`
- De bestaande migratiecode in `src/database.js` leest settings.json nog één keer in als het bestaat (voor backwards compat), daarna nooit meer
- `config.json` structuur blijft exact zoals het is (redirectUri + frontendUrl)
- Verwijder `settings.json` uit de repo

### Commit
`refactor: verwijder settings.json, config.json is enige config — v1.7.0-fase2`

---

## Fase 3 — Database uitbreiden voor profielen

### Nieuwe tabellen (toevoegen aan schema in src/database.js)
```sql
CREATE TABLE IF NOT EXISTS user_levels (
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  user_naam   TEXT NOT NULL,
  punten      INTEGER NOT NULL DEFAULT 0,
  level       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  guild_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  achievement   TEXT NOT NULL,
  behaald_op    INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (guild_id, user_id, achievement)
);
```

### Puntentelling
Voeg punten toe op deze momenten (in de bestaande command handlers):

| Actie | Punten |
|---|---|
| Ronde starten (/wod) | +5 |
| Vraag voltooien (nieuwe_ronde knop) | +10 |
| Passen | -3 |
| Reroll | -1 |
| Stem in /nooit | +3 |
| /relatietest voltooien | +15 (beide spelers) |

### Levels
```
Level 1 — Lafaard        (0–49 punten)
Level 2 — Durfal         (50–149 punten)
Level 3 — Onthullingsmaster (150–299 punten)
Level 4 — Legenda        (300+ punten)
```

### check_achievements(guild_id, user_id) — centrale functie in src/game.js
Roep deze aan na elke puntenmutatie. Controleert welke achievements de gebruiker nog niet heeft en kent ze toe als de voorwaarde geldt.

| Achievement | Voorwaarde |
|---|---|
| Eerste stap | eerste keer punten ontvangen |
| Reroll addict | 10x reroll gebruikt |
| Lafaard | 5x gepast |
| Durfal | level 2 bereikt |
| Op dreef | 3 rondes op één avond gespeeld (één sessie) |
| Lovebird | /relatietest voltooid |
| Zelfinzicht | /liefdestaal of /persoonlijkheid voltooid |
| Legenda | level 4 bereikt |

### Nieuwe prepared statements (toevoegen aan stmts in src/database.js)
```js
upsertUserLevel: db.prepare(`
  INSERT INTO user_levels (guild_id, user_id, user_naam, punten, level)
  VALUES (?, ?, ?, ?, 1)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET
    user_naam = excluded.user_naam,
    punten = punten + excluded.punten,
    level = excluded.level
`),
getUserLevel:       db.prepare("SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?"),
getRanglijst:       db.prepare("SELECT * FROM user_levels WHERE guild_id = ? ORDER BY punten DESC LIMIT 10"),
insertAchievement:  db.prepare("INSERT OR IGNORE INTO user_achievements (guild_id, user_id, achievement) VALUES (?, ?, ?)"),
getUserAchievements: db.prepare("SELECT * FROM user_achievements WHERE guild_id = ? AND user_id = ? ORDER BY behaald_op ASC"),
```

### Commit
`feat: voeg user_levels en user_achievements tabellen toe — v1.7.0-fase3`

---

## Fase 4 — /profiel, /ranglijst, /achievements commands

### /profiel (optioneel: @user)
- Zonder parameter: eigen profiel
- Met @user: profiel van die gebruiker
- Embed toont: naam, level + naam (bijv. "Level 2 — Durfal"), punten, aantal achievements behaald
- Voortgangsbalk naar volgend level (bijv. `████░░ 80/150`)

### /ranglijst
- Top 10 van de huidige server op punten
- Embed met genummerde lijst, huidig level erbij

### /achievements
- Lijst van alle achievements met ✅ (behaald + datum) of 🔒 (nog niet)
- Altijd eigen achievements

### Nieuwe command-bestanden
- `src/commands/game/profiel.js`
- `src/commands/game/ranglijst.js`
- `src/commands/game/achievements.js`

### SlashCommandBuilders toevoegen aan command registratie
```js
new SlashCommandBuilder()
  .setName("profiel")
  .setDescription("Bekijk jouw profiel of dat van een andere speler.")
  .addUserOption(opt =>
    opt.setName("speler").setDescription("Optioneel: bekijk het profiel van een andere speler.").setRequired(false)
  ),
new SlashCommandBuilder()
  .setName("ranglijst")
  .setDescription("Bekijk de top 10 van deze server."),
new SlashCommandBuilder()
  .setName("achievements")
  .setDescription("Bekijk jouw behaalde achievements."),
```

### Commit
`feat: voeg /profiel, /ranglijst en /achievements toe — v1.7.0-fase4`

---

## Fase 5 — Admin panel: Ranglijst pagina

### Nieuw bestand: admin/src/pages/Ranglijst.jsx
- Tabel met top 10 spelers: naam, punten, level, aantal achievements
- Zelfde stijl als bestaande pagina's (zie Statistieken.jsx als referentie)

### API endpoint toevoegen in src/server.js
```js
app.get("/api/ranglijst", requireAuth, requireGuild, (req, res) => {
  const rows = stmts.getRanglijst.all(req.session.activeGuildId);
  res.json(rows);
});
```

### Toevoegen aan admin/src/api.js
```js
getRanglijst: () => req('GET', '/api/ranglijst'),
```

### Toevoegen aan navigatie in admin/src/components/Layout.jsx
Voeg "🏆 Ranglijst" toe aan de navigatielijst, na "📊 Statistieken".

### Toevoegen aan admin/src/App.jsx
```jsx
import Ranglijst from './pages/Ranglijst.jsx';
// ...
<Route path="/ranglijst" element={<Ranglijst />} />
```

### Commit
`feat: voeg ranglijst pagina toe aan admin panel — v1.7.0-fase5`

---

## Afronden

- Verhoog versienummer in `package.json` naar `1.7.0`
- Update `README.md`:
  - Voeg nieuwe commands toe: `/profiel`, `/ranglijst`, `/achievements`
  - Voeg nieuwe projectstructuur toe
- Eindigcommit: `feat: WoD Bot v1.7.0 — profielen, levels en achievements`

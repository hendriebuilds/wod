# Fase 4 — Punten eerlijk en achievements rechtgezet

## Doel
`/nooit` en `/relatietest` zijn niet meer te farmen. Admins kunnen strafpunten geven met `/strafpunten`. De achievements staan op één plek, passen bij de 8 levels en worden eenmalig rechtgezet voor bestaande spelers. De ranglijst in het panel toont de juiste levelnamen.

## Bestanden
- `src/game.js`: `ACHIEVEMENTS`, `checkAchievements()`, `migreerAchievements()`
- `src/database.js`: tabellen `migraties`, `relatietest_punten`, `strafpunten` en stmts
- `src/buttons.js`: `/nooit`-stemmen, relatietest-uitslag, achievement-emoji uit `game.js`
- `src/embeds.js`: `buildAchievementsEmbed`, `buildRelatieResultaatEmbed`, `buildStrafpuntenEmbed` (nieuw)
- `src/commands/game/nooit.js`
- `src/commands/admin/strafpunten.js`: **nieuw**
- `src/server.js`: `GET /api/ranglijst`
- `index.js`: `migreerAchievements()` bij het starten
- `admin/src/i18n/nl.js`, `en.js`: `ranglijst.levelNamen`
- `CLAUDE.md`, `README.md`

## Stappen

### 1. `/nooit`: één keer punten per stemming
- `nooit.js`: de stemming krijgt een extra `beloond: new Set()`.
- `buttons.js`, stemmen: +3 alleen als `!sessie.beloond.has(userId)`; daarna `beloond.add(userId)`. Aan- en uitzetten, of wisselen tussen Wel en Nooit, werkt als nu maar levert geen punten meer op.
- Maak de stemcode meteen korter: één pad voor `wel` en `nooit` (toggle, wissel, knoppen bijwerken), met de puntenregel ervoor. Level-up en achievements melden zoals nu.

### 2. Relatietest: één keer per paar per dag
- Nieuwe tabel:
  ```sql
  CREATE TABLE IF NOT EXISTS relatietest_punten (
    guild_id TEXT NOT NULL,
    speler_a TEXT NOT NULL,   -- laagste ID van het paar
    speler_b TEXT NOT NULL,   -- hoogste ID van het paar
    datum    TEXT NOT NULL,   -- 'YYYY-MM-DD' in Europe/Amsterdam
    PRIMARY KEY (guild_id, speler_a, speler_b, datum)
  );
  ```
  stmt `insertRelatietestPunten`: `INSERT OR IGNORE …`.
- Datum: `new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date())`.
- Bij de uitslag: IDs sorteren, insert uitvoeren. `changes === 1` → +15 voor beide (zoals nu). `0` → geen punten, en onder de uitslag de regel `ℹ️ Geen punten: jullie deden de test vandaag al samen.` (parameter `puntenGegeven` in `buildRelatieResultaatEmbed`).
- "Lovebird" blijft gewoon toegekend (kan maar één keer).

### 3. `/strafpunten`
`src/commands/admin/strafpunten.js`. De map `admin/` zorgt al voor de rechtencheck in `interactionCreate`.
```js
new SlashCommandBuilder()
  .setName('strafpunten')
  .setDescription('Trek punten af van een speler als straf. (Alleen voor admins)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption(o => o.setName('speler').setDescription('Wie krijgt de straf?').setRequired(true))
  .addIntegerOption(o => o.setName('aantal').setDescription('Aantal punten (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
  .addStringOption(o => o.setName('reden').setDescription('Waarom?').setRequired(true).setMaxLength(200))
```
- Een bot → ephemeral `❌ Bots hebben geen punten.`
- Reden trimmen; leeg na trimmen → ephemeral foutmelding. Aantal opnieuw controleren (1–100, harde regel 10).
- `game.voegPuntenToe(guildId, speler.id, naam, -aantal)`. Punten gaan nooit onder 0 (zoals nu); het werkelijk afgetrokken aantal is `puntenVoor - puntenNa`. Voeg dat toe aan de return van `voegPuntenToe` (`effectiefDelta`).
- Vastleggen voor een later auditlog:
  ```sql
  CREATE TABLE IF NOT EXISTS strafpunten (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    door_id  TEXT NOT NULL,
    aantal   INTEGER NOT NULL,   -- werkelijk afgetrokken
    reden    TEXT NOT NULL,
    op       INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_strafpunten_guild ON strafpunten(guild_id);
  ```
- Openbaar bericht in het kanaal, `buildStrafpuntenEmbed({ spelerNaam, aantal, gevraagd, reden, doorNaam, puntenNa })`, kleur `#ffa500`:
  - titel `⚖️ Strafpunten!`
  - beschrijving `**spelerNaam** verliest **aantal** punten.\n> reden` (reden afkappen op 200 tekens)
  - was het werkelijke aantal lager dan gevraagd: extra regel `(Meer dan 0 punten kon er niet af.)`
  - footer `Uitgedeeld door doorNaam • nu puntenNa punten`
  - `allowedMentions: { parse: [] }`, geen ping.
- Een level omlaag geeft geen melding (zoals bij reroll en passen).

### 4. Achievements op één plek
In `src/game.js`:
```js
export const ACHIEVEMENTS = [
  { id: 'Eerste stap',       emoji: '👣', beschrijving: 'Voor het eerst punten ontvangen',          check: r => r.punten !== null },
  { id: 'Durfal',            emoji: '💪', beschrijving: 'Level 3 (Durfal) bereikt',                  minLevel: 3 },
  { id: 'Onthullingsmaster', emoji: '🔓', beschrijving: 'Level 5 (Onthulling) bereikt',              minLevel: 5 },
  { id: 'Legenda',           emoji: '👑', beschrijving: 'Level 8 (Legenda) bereikt',                 minLevel: 8 },
  { id: 'Reroll addict',     emoji: '🎲', beschrijving: '10x gererold',                              check: r => (r.reroll_teller ?? 0) >= 10 },
  { id: 'Schijterd',         emoji: '😅', beschrijving: '5x gepast',                                 check: r => (r.passen_teller ?? 0) >= 5 },
  { id: 'Op dreef',          emoji: '🔥', beschrijving: '3 rondes voltooid',                         check: r => (r.rondes_teller ?? 0) >= 3 },
  { id: 'Lovebird',          emoji: '💑', beschrijving: '/relatietest voltooid' },                   // toegekend in buttons.js
  { id: 'Zelfinzicht',       emoji: '🧠', beschrijving: '/liefdestaal of /persoonlijkheid voltooid' }, // idem
];
export function achievementEmoji(id) // → emoji of '🏆'
```
- `checkAchievements()` loopt over `ACHIEVEMENTS`. Het level komt uit `getLevelInfo(row.punten).level`, niet uit de kolom `level`.
- `buildAchievementsEmbed()` en `buttons.js` (`ACHIEVEMENT_EMOJIS` weg) lezen uit `ACHIEVEMENTS`/`achievementEmoji()`. Check ook `buildProfielEmbed` op losse achievement-namen.
- "Lafaard" is voortaan alleen de naam van level 1; het achievement heet "Schijterd".

### 5. Eenmalige migratie
- Nieuwe tabel in `database.js`:
  ```sql
  CREATE TABLE IF NOT EXISTS migraties (
    naam         TEXT PRIMARY KEY,
    uitgevoerd_op INTEGER NOT NULL DEFAULT (unixepoch())
  );
  ```
  stmts `getMigratie`, `insertMigratie`.
- `migreerAchievements()` in `src/game.js` (daar staan `LEVELS` en `getLevelInfo`; in `database.js` zou dat een circulaire import geven). Aanroepen in `index.js` bij het starten, vóór `client.login`. In `try/catch` met een logregel; een fout stopt de bot niet.
- Doet niets als `achievements_v1_10` al in `migraties` staat. Anders, in één `db.transaction`:
  1. `UPDATE user_achievements SET achievement = 'Schijterd' WHERE achievement = 'Lafaard'`
  2. Voor elke rij in `user_levels`: `lvl = getLevelInfo(punten).level`; kolom `level` bijwerken als die afwijkt.
  3. Voor `Durfal` (3), `Onthullingsmaster` (5) en `Legenda` (8): `lvl >= minLevel` → `INSERT OR IGNORE`, anders `DELETE`.
  4. `INSERT INTO migraties (naam) VALUES ('achievements_v1_10')`
- Log het resultaat: `🏅 Achievements rechtgezet: X toegekend, Y ingetrokken, Z hernoemd.`
- Geen meldingen in Discord voor toegekende of ingetrokken achievements.

### 6. Levelnamen in het panel
- `GET /api/ranglijst`: per rij `level` vervangen door `getLevelInfo(row.punten).level`.
- `admin/src/i18n/nl.js`:
  `'ranglijst.levelNamen': ['', 'Lafaard', 'Deelnemer', 'Durfal', 'Avonturier', 'Onthulling', 'Verleider', 'Kampioen', 'Legenda'],`
- `admin/src/i18n/en.js`:
  `'ranglijst.levelNamen': ['', 'Coward', 'Participant', 'Daredevil', 'Adventurer', 'Revelation', 'Seducer', 'Champion', 'Legend'],`
- Panel bouwen.

### 7. Docs
- `CLAUDE.md`: tabellen `migraties`, `relatietest_punten`, `strafpunten`; command `/strafpunten` bij Admin; puntentabel; achievements staan in `ACHIEVEMENTS` (`src/game.js`); eenmalige migraties via de tabel `migraties`.
- `README.md`: `/strafpunten` bij Beheer; puntentabel met "één keer per stemming" en "één keer per paar per dag"; lijst met achievements.

## Databasewijzigingen
- Nieuwe tabellen `migraties`, `relatietest_punten`, `strafpunten` (met `CREATE TABLE IF NOT EXISTS`, ná de bestaande tabellen).
- Data: eenmalige migratie `achievements_v1_10` (stap 5).

## Klaar als
- [ ] Aan/uit stemmen of wisselen bij `/nooit` levert maar één keer +3 op per stemming.
- [ ] Een tweede relatietest van hetzelfde paar op dezelfde dag geeft geen punten en toont de melding; de volgende dag weer wel. Andere paren hebben er geen last van.
- [ ] `/strafpunten` werkt alleen met *Server beheren*, valideert de invoer, gaat nooit onder 0, schrijft een rij in `strafpunten` en plaatst een oranje embed zonder ping.
- [ ] `ACHIEVEMENTS` is de enige definitie; `buttons.js` en `embeds.js` hebben geen eigen lijst meer.
- [ ] Na de eerste start staat `achievements_v1_10` in `migraties`, zijn de level-achievements rechtgezet en is "Lafaard" hernoemd; een tweede start doet niets.
- [ ] De ranglijst in het panel toont 8 levels met de juiste namen (NL en EN).
- [ ] Commit `v1.10.0 (fase 4/5) — punten eerlijk, achievements rechtgezet`, gepusht, `check` groen.

## Teststappen
Maak vóór het testen een kopie van `bot.db`.
1. **Migratie:** noteer vooraf met `/achievements` wie "Legenda" of "Lafaard" heeft. Start de bot → logregel met aantallen. Spelers onder level 8 hebben geen "Legenda" meer, "Lafaard" heet nu "Schijterd", en een speler op level 5+ heeft "Onthullingsmaster". Herstart → geen nieuwe logregel met wijzigingen.
2. **`/nooit`:** A stemt Wel (+3), zet uit, stemt Nooit, stemt weer Wel → in totaal +3. B stemt → B +3.
3. **Relatietest:** A en B doen de test → allebei +15. Meteen nog een keer → uitslag met "Geen punten…". A en C → wel +15.
4. **`/strafpunten`:** als admin `/strafpunten speler:A aantal:10 reden:te laat` → oranje embed, A −10. Speler met 5 punten en `aantal:20` → "verliest 5 punten" plus de regel over 0. Zonder *Server beheren* → geen rechten. Met een bot → foutmelding.
5. **Achievements:** speel tot iemand level 3 haalt → "Durfal" op dat moment, niet eerder.
6. **Panel:** Ranglijst toont bijv. "Lv.4 Avonturier"; wissel naar EN → "Adventurer".
7. **Server 2:** strafpunten, stemmingen en relatietests van server 1 hebben daar geen effect.

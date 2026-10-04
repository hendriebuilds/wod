# Fase 2 — Lengtes en ephemeral

## Doel
Nieuwe vragen en stellingen hebben een maximale lengte: 500 tekens voor vragen en doe-opdrachten, 300 voor Nooit-stellingen. Embeds gaan nooit meer over de limieten van Discord heen, ook niet door bestaande lange teksten of veel stemmers bij `/nooit`. Daarnaast verdwijnt de verouderde optie `ephemeral: true` uit de code.

## Bestanden
- `src/game.js` (of `src/categorieen.js` uit fase 1): `MAX_LENGTE`
- `src/embeds.js`: `kapAf()`, `naamLijst()`, toepassen in alle builders
- `src/commands/admin/voeg-toe.js`, `src/commands/game/nooit.js`: `setMaxLength`
- `src/server.js`: lengte bij `POST`/`PUT /api/vragen`, `POST`/`PUT /api/nooit` en de CSV-import
- `admin/src/pages/Vragen.jsx`, `admin/src/pages/Nooit.jsx`: `maxLength`
- Alle bestanden met `ephemeral:` (`src/`, `index.js`, `src/interactionError.js`)
- `README.md`, `CLAUDE.md`

## Stappen

### 1. Limieten op één plek
```js
export const MAX_LENGTE = { vraag: 500, stelling: 300 };
```

### 2. Invoer begrenzen
- **`/voeg-toe`:** `tekst` met `.setMaxLength(MAX_LENGTE.vraag)`. Ook in `execute()` controleren (`tekst.length > MAX_LENGTE.vraag`), met de ephemeral melding `❌ Een vraag mag maximaal 500 tekens zijn.`
- **`/nooit`:** optie `stelling` met `.setMaxLength(MAX_LENGTE.stelling)`, en dezelfde controle in `execute()`.
- **API:** `POST`/`PUT /api/vragen` en `POST`/`PUT /api/nooit` → `400 { error: 'Tekst is te lang.', code: 'te_lang' }`.
- **CSV-import:** een regel met een tekst boven 500 tekens telt als `ongeldig` (zie fase 1).
- **Panel:** `maxLength={500}` op het invoer- en bewerkveld in `Vragen.jsx`, `maxLength={300}` in `Nooit.jsx`. Een vaste waarde in JSX is hier prima, want het is geen zichtbare tekst. Zet er wel `// Gelijk houden met MAX_LENGTE in src/game.js` bij.

Bestaande teksten die al te lang zijn blijven staan. In het panel kun je ze alleen opslaan als je ze inkort, want het bewerkveld knipt bij 500 af. Dat is de bedoeling.

### 3. Veilig afkappen bij tonen (`src/embeds.js`)
```js
export const LIMIET = { titel: 256, beschrijving: 4096, veldNaam: 256, veldWaarde: 1024, footer: 2048, bericht: 2000 };

// Knipt op hele tekens (emoji blijven heel) en eindigt met …
export function kapAf(tekst, max) {
  const tekens = Array.from(String(tekst ?? ''));
  return tekens.length <= max ? tekens.join('') : tekens.slice(0, max - 1).join('').trimEnd() + '…';
}

// Namen tot de limiet, daarna "… en N anderen"
export function naamLijst(namen, max = LIMIET.veldWaarde, scheiding = ', ') { … }
```
Pas deze functies toe in **alle** builders:
- elke `setTitle`, `setDescription` en `setFooter({ text })`
- elk veld in `addFields`/`setFields` (naam en waarde)
- en `content` waar tekst van spelers in een gewoon bericht komt

`EmbedBuilder` gooit een fout zodra een waarde over de limiet gaat, dus afkappen moet vóór het zetten. Kap de **hele** beschrijving af, inclusief de tekst eromheen, niet alleen de vraag.

Let vooral op:
- waarheid-, doe- en straf-embeds (vraagtekst plus speler en categorie)
- `/nooit`: stelling en de uitslag met namen, via `naamLijst()`
- `/lijst`, als die vragen in één embed toont: per regel afkappen, en controleren dat het totaal binnen 4096 tekens blijft
- profiel, ranglijst en achievements (namen)
- relatietest (twee namen)

Discord telt de lengte in UTF-16-eenheden, `Array.from` in codepoints. Met de marge tussen 500 en 4096 maakt dat in de praktijk niets uit. Voor de harde limieten (4096 en 1024) mag `kapAf` op `.length` controleren en op codepoints knippen.

### 4. `ephemeral: true` vervangen
- `grep -rn "ephemeral" src index.js`
- Vervang elke `ephemeral: true` door `flags: MessageFlags.Ephemeral`. Importeer `MessageFlags` uit `discord.js`. Dit geldt ook voor `deferReply`, `followUp` en `replyError()` in `src/interactionError.js`.
- Heeft een object al `flags`, combineer ze dan met `|`.
- Is een waarde variabel (bijv. `ephemeral: isDm`), gebruik dan `flags: isDm ? MessageFlags.Ephemeral : undefined`.
- Na afloop staat `ephemeral` alleen nog in commentaar, of nergens meer.

### 5. Docs
- `README.md`: maximaal 500 tekens per vraag en 300 per stelling. Langere bestaande teksten worden afgekapt getoond.
- `CLAUDE.md`, harde regel 10 (invoer): `MAX_LENGTE` en `kapAf()` noemen als de vaste manier. Gebruik voor ephemeral altijd `flags: MessageFlags.Ephemeral`.

## Databasewijzigingen
Geen.

## Klaar als
- [ ] `/voeg-toe` en `/nooit stelling:` laten in Discord niet meer dan 500 en 300 tekens toe. De server controleert dit ook zelf.
- [ ] API en CSV weigeren te lange teksten (`te_lang`, of meegeteld als `ongeldig`).
- [ ] De invoervelden in het panel hebben `maxLength`.
- [ ] Elke titel, beschrijving, footer en veldwaarde in `embeds.js` gaat via `kapAf()`. Namenlijsten gaan via `naamLijst()`.
- [ ] Een bestaande vraag van 4200 tekens geeft een afgekapte embed in plaats van een fout.
- [ ] `grep -rn "ephemeral: true" src index.js` geeft niets terug, en bij het starten verschijnt geen waarschuwing over `ephemeral`.
- [ ] Alle ephemeral meldingen zijn nog steeds alleen zichtbaar voor de gebruiker zelf.
- [ ] `cd admin && npm run build` geeft geen fouten.
- [ ] Commit `v1.10.1 (fase 2/3) — maximale lengtes en MessageFlags.Ephemeral`, gepusht, `check` groen.

## Teststappen
1. **Invoer in Discord:** plak bij `/voeg-toe` een tekst van meer dan 500 tekens. Discord laat dat niet toe. Doe hetzelfde bij `/nooit stelling:` met meer dan 300.
2. **Invoer in het panel:** plak een lange tekst in het veld voor een nieuwe vraag. Het veld stopt bij 500 tekens.
3. **Afkappen:** zet op server 2 een extreem lange vraag in de database:
   ```sh
   docker exec -it <CONTAINER> node --input-type=module -e "import D from 'better-sqlite3'; new D('/app/data/bot.db').prepare('INSERT INTO vragen (guild_id, type, tekst, categorie) VALUES (?, ?, ?, ?)').run('<SERVER-2-ID>', 'waarheid', 'Lang '.repeat(840) + '?', 'algemeen')"
   ```
   Zoek het nummer met `/lijst waarheid` en doe `/waarheid nummer:<nummer>`. Je krijgt een embed die eindigt op `…`, geen foutmelding. Ook `/lijst` werkt nog. Verwijder de vraag daarna in het panel.
4. **Ephemeral:** controleer dat deze meldingen alleen voor jou zichtbaar zijn: de cooldown-melding, op een knop van een andere speler klikken, een admin command zonder rechten (testaccount), en `/voeg-toe` met een dubbele vraag.
5. **Logs:** in de Unraid-logs staat na de start geen deprecation-waarschuwing over `ephemeral`.
6. **Server 1:** speel een normale ronde met `/wod`, Reroll, Passen en Nieuwe ronde, en een `/nooit`-ronde. Alles werkt als voorheen.

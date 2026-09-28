# Fase 2 — Rondes: alleen de speler aan de beurt

## Doel
Elke ronde hoort bij één speler. Alleen die speler kan kiezen, rerollen, passen en een nieuwe ronde starten, en alleen die speler krijgt of verliest punten. De speler staat in de custom ID van de knoppen, zodat het ook na een herstart klopt. Punten komen pas bij een gemaakte keuze, niet meer bij `/wod`. Na "Nieuwe ronde" staat in de nieuwe embed wie heeft geantwoord en wie nu aan de beurt is.

Eerst komt de dubbele code voor het versturen van een vraag in één functie. Dat maakt deze fase en fase 3 veel kleiner.

## Bestanden
- `src/ronde.js`: **nieuw** (`stuurVraag()`, `parseRondeKnop()`, `claimBericht()`)
- `src/buttons.js`: rondeknoppen herschreven
- `src/embeds.js`: `buildKiesEmbed`, `buildKiesButtons`, `buildDisabledKiesButtons`, `buildActieButtons`
- `src/game.js`: `getHuidigeSpeler()`
- `src/commands/game/wod.js`, `waarheid.js`, `doen.js`
- `CLAUDE.md`, `README.md` (punten, knoppen)

## Stappen

### 1. `src/ronde.js` — één plek voor een vraag
```js
export async function stuurVraag(interaction, {
  type,          // 'waarheid' | 'doen'
  speler,        // { id, naam }
  variant,       // 'normaal' | 'reroll' | 'straf'
  vraag = null,  // al gekozen vraag (bij /waarheid nummer:), anders kiest de functie
  via,           // 'reply' | 'followUp'
}) → Promise<boolean>   // false als er geen vraag was (melding is dan al gestuurd)
```
De functie doet wat nu tien keer in `buttons.js`, `waarheid.js` en `doen.js` staat:
- sessie-ID en categoriefilter ophalen, vraag kiezen met `game.getVraag()` (als `vraag` leeg is)
- geen vraag: ephemeral melding (`❌ Geen waarheidsvragen beschikbaar.` of `❌ Geen doe-opdrachten beschikbaar.`) en `false`
- teller `aantalWaarheid`/`aantalDoen` ophogen en opslaan, alleen bij `normaal` (zoals nu)
- embed kiezen: `normaal` → `buildWaarheidEmbed`/`buildDoenEmbed`, `reroll` → dezelfde met `isReroll`, `straf` → `buildStrafWaarheidEmbed`/`buildStrafDoenEmbed`
- DM-modus (server of vraag): embed via DM, in het kanaal het bericht `📩 … verstuurd via DM aan **naam**!` met de actieknoppen; mislukt de DM, dan de embed in het kanaal (zoals nu)
- actieknoppen: `buildActieButtons(type, speler.id)`

Embeds krijgen voortaan de naam van de speler (`speler.naam`) in plaats van een `user`-object. Pas de `build*Embed`-functies daarop aan (parameter `spelerNaam`).

### 2. Custom IDs met de speler
Nieuwe vorm (`<id>` is een Discord-ID van 17–20 cijfers):

| knop | custom ID |
|---|---|
| Waarheid / Doen / Verrassing | `kies_waarheid_<id\|open>`, `kies_doen_<id\|open>`, `kies_random_<id\|open>` |
| Reroll | `reroll_waarheid_<id>`, `reroll_doen_<id>` |
| Passen | `passen_waarheid_<id>`, `passen_doen_<id>` |
| Nieuwe ronde | `nieuwe_ronde_<id>` |

- `buildKiesButtons(spelerId)`: `spelerId` of `'open'`. `buildDisabledKiesButtons(spelerId)` idem.
- `buildActieButtons(type, spelerId)`.
- In `src/ronde.js`:
  ```js
  export function parseRondeKnop(customId)
  // → { actie: 'kies'|'reroll'|'passen'|'nieuwe', type: 'waarheid'|'doen'|'random'|null, spelerId: string|'open' }
  // → { legacy: true } voor de oude IDs zonder speler (kies_waarheid, reroll_doen, nieuwe_ronde, …)
  // → null voor alles wat geen rondeknop is
  ```
  Regex: `^(kies|reroll|passen)_(waarheid|doen|random)_(\d{17,20}|open)$` en `^nieuwe_ronde_(\d{17,20})$`. `random` alleen bij `kies`, `open` alleen bij `kies`.

### 3. Controle in `handleButton`
Bovenaan de rondeknoppen, na de cooldown:
1. `legacy` → ephemeral `⌛ Deze ronde is van vóór een update. Start een nieuwe met /wod.` en stoppen.
2. `spelerId !== 'open'` en `interaction.user.id !== spelerId` → ephemeral `🙅 Het is de beurt van <@spelerId>.` (met `allowedMentions: { parse: [] }`; in een ephemeral bericht pingt het niet, maar toont het wel de naam) en stoppen. Er gebeurt niets met punten of het bericht.
3. **Dubbel klikken voorkomen:** `claimBericht(messageId)` in `src/ronde.js` met een `Set` van bericht-ID's die al een rondeknop hebben verwerkt (verwijderen na 15 minuten met `setTimeout(...).unref()`). Al geclaimd → `deferUpdate()` en stoppen. Zo kan een open ronde maar door één speler worden gepakt, en levert snel dubbelklikken geen dubbele punten op.

Spelers voor de handlers: `speler = { id: interaction.user.id, naam: interaction.member?.displayName ?? interaction.user.username }`. Na de controle is de klikker altijd de speler.

### 4. De handlers
- **kies_\*:** `interaction.update({ components: [buildDisabledKiesButtons(spelerId)] })`. Bij `open`: pas de embed aan naar `Het is **naam**'s beurt!` zodat zichtbaar is wie de ronde pakte. Dan `stuurVraag(..., { variant: 'normaal', via: 'followUp' })`. Bij `random` eerst het type loten. Alleen als `stuurVraag` `true` geeft: **+5 punten** voor de speler, level-up en achievements melden.
- **reroll_\*:** −5, `incrReroll`, reroll-teller in de sessie-cache (zoals nu), bericht verwijderen, `stuurVraag(..., { variant: 'reroll', via: 'followUp' })`.
- **passen_\*:** −7, `incrPassen`, bericht verwijderen, `stuurVraag(..., { variant: 'straf', via: 'followUp' })`.

  Let op bij reroll en passen: nu worden de punten afgetrokken voordat bekend is of er een vraag is. Kies eerst de vraag (via een losse `kiesVraag()`-helper in `ronde.js`, die `stuurVraag` zelf ook gebruikt), en trek pas punten af als die er is. Dan `deferUpdate()` en het bericht verwijderen.
- **nieuwe_ronde_\*:** zie stap 5.

### 5. Nieuwe ronde en "wie is er aan de beurt"
Klikt de speler op Nieuwe ronde:
1. **+5 punten** en `incrRondes` voor de speler, level-up en achievements melden.
2. Oude bericht: `interaction.update({ components: [] })`.
3. Volgende speler bepalen:
   - rotatie niet leeg → `game.advanceerBeurt(guildId)` → `{ id, naam }`
   - rotatie leeg → `null` (open ronde)
4. Nieuwe kies-embed als follow-up met `buildKiesEmbed({ spelerNaam, vorigeNaam })` en `buildKiesButtons(volgende?.id ?? 'open')`.

`buildKiesEmbed({ spelerNaam = null, vorigeNaam = null })`, kleur `#fee75c`, titel `🎮 Waarheid of Doen`:
- met `vorigeNaam`: eerste regel `✅ **vorigeNaam** heeft geantwoord!`, dan een lege regel
- met `spelerNaam`: `Nu is **spelerNaam** aan de beurt! Kies een optie hieronder.` (zonder `vorigeNaam`: `Het is **spelerNaam**'s beurt! Kies een optie hieronder.`)
- zonder `spelerNaam`: `Wie is de volgende? De eerste die kiest, is aan de beurt.`
- footer blijft `Waarheid of Doen • Durf jij het aan?`

Niemand wordt gepingd.

### 6. `/wod`
- `game.getHuidigeSpeler(guildId)` in `src/game.js`: `{ id, naam }` van de huidige speler in de rotatie, of `null`. `getHuidigeSpelerNaam` kan weg als niets anders hem gebruikt.
- Speler van de ronde:
  1. optie `speler` (een bot → ephemeral `❌ Een bot kan geen Waarheid of Doen spelen.`)
  2. anders de huidige speler uit de rotatie
  3. anders degene die `/wod` gebruikt
- **Geen punten meer** bij `/wod`. De level-up code in `wod.js` kan weg.
- `reply` met `buildKiesEmbed({ spelerNaam: speler.naam })` en `buildKiesButtons(speler.id)`.

### 7. `/waarheid` en `/doen`
- Speler is degene die het command gebruikt.
- Zonder nummer: `stuurVraag(interaction, { type, speler, variant: 'normaal', via: 'reply' })`.
- Met nummer: de vraag zoeken zoals nu en meegeven als `vraag`; de vraag-ID in `gebruikteWaarheid`/`gebruikteDoen` zetten zoals nu. (Fase 3 voegt de categoriecontrole toe.)
- Geen punten (zoals nu). De actieknoppen horen bij de speler.

## Databasewijzigingen
Geen.

## Klaar als
- [ ] `stuurVraag()` in `src/ronde.js` is de enige plek die een waarheid/doen-embed met actieknoppen verstuurt; `buttons.js`, `waarheid.js` en `doen.js` hebben geen eigen DM/kanaal-logica meer.
- [ ] Alle rondeknoppen hebben de nieuwe custom IDs; `parseRondeKnop()` herkent ze, en de oude IDs geven de melding "verlopen".
- [ ] Een andere speler die klikt, krijgt een ephemeral melding; er verandert niets aan punten of het bericht.
- [ ] Open ronde: de eerste klikker wordt de speler; een tweede klik op hetzelfde bericht doet niets.
- [ ] `/wod` geeft geen punten; kiezen +5, Nieuwe ronde +5, Reroll −5, Passen −7, alles voor de speler.
- [ ] Reroll en Passen trekken geen punten af als er geen vraag is.
- [ ] De kies-embed na Nieuwe ronde noemt wie heeft geantwoord en wie nu aan de beurt is (of dat het open is).
- [ ] `CLAUDE.md`: knoppentabel en punten bijgewerkt, `src/ronde.js` in "Structuur". `README.md`: puntentabel.
- [ ] Commit `v1.10.0 (fase 2/5) — alleen de speler aan de beurt`, gepusht; `check` in Actions is groen, `release` slaat over.

## Teststappen
Met twee accounts (A en B) op server 1.
1. **Zonder rotatie:** A doet `/wod`. B klikt op Waarheid → ephemeral "Het is de beurt van A", niets verandert. A klikt Waarheid → vraag verschijnt; `/profiel` van A is +5 (niet +10).
2. **Knoppen van A:** B klikt Reroll, Passen en Nieuwe ronde → steeds de melding, geen puntenverandering bij A of B.
3. **Nieuwe ronde, open:** A klikt Nieuwe ronde (+5). Nieuwe embed: "✅ A heeft geantwoord! Wie is de volgende?". B klikt Doen → B is aan de beurt, de embed toont B. Klik daarna met A op dezelfde knoppen → niets.
4. **Met rotatie:** `/beurt toevoegen` A en B. `/wod` → A aan de beurt. A kiest en klikt Nieuwe ronde → "✅ A heeft geantwoord! Nu is B aan de beurt!". Alleen B kan kiezen.
5. **`/wod speler:B`** door A → alleen B kan kiezen. `/wod speler:` met een bot → foutmelding.
6. **Spam:** A doet tien keer `/wod` zonder te kiezen → geen punten erbij.
7. **Dubbelklik:** A klikt snel twee keer op Waarheid → één vraag, één keer +5.
8. **DM-modus aan:** vraag komt via DM, de knoppen in het kanaal werken alleen voor de speler.
9. **Oude knoppen:** klik op een ronde van vóór de update → melding "verlopen".
10. **Herstart:** start een ronde, herstart de container, klik als B → nog steeds "beurt van A"; als A → werkt.
11. **Server 2:** punten en rotatie van server 1 zijn daar niet zichtbaar.

# Fase 3 — Categorieën: gekoppeld is gekoppeld

## Doel
Een kanaal dat aan een categorie is gekoppeld, toont alleen vragen uit die categorie: geen fallback naar andere categorieën, ook niet via een nummer of DM. Elke vraag laat zien uit welke categorie hij komt, met een duidelijk 🔞 bij 18+. Zonder koppeling verandert er niets: alle categorieën, 18+ inbegrepen, blijven overal door elkaar verschijnen (harde regel 11).

## Bestanden
- `src/game.js`: `CATEGORIEEN`, `categorieLabel()`, `getVraag()`
- `src/database.js`: nieuwe stmt `countVragenByCategorie`
- `src/ronde.js`: melding bij geen vragen in de categorie
- `src/embeds.js`: categorie in titel en footer van waarheid/doen/straf-embeds
- `src/commands/game/waarheid.js`, `doen.js`: nummer binnen de categorie
- `CLAUDE.md` (harde regel 11), `README.md` (categorieën)

## Stappen

### 1. Eén lijst met categorieën
In `src/game.js`:
```js
export const CATEGORIEEN = {
  algemeen: { emoji: '🌐', naam: 'Algemeen' },
  vrienden: { emoji: '👫', naam: 'Vrienden' },
  koppels:  { emoji: '💑', naam: 'Koppels' },
  feest:    { emoji: '🎉', naam: 'Feest' },
  '18+':    { emoji: '🔞', naam: '18+' },
};
export function categorieLabel(categorie) // → '🔞 18+'; onbekend → `🏷️ ${categorie}`
```
Alleen voor weergave. Valideren op deze lijst hoort bij een ander backlog-item en valt buiten deze versie.

### 2. `getVraag()` zonder fallback
- Met `categorieFilter`: alleen vragen uit die categorie. Zijn er geen, dan `null`. De regel die terugvalt op `stmts.getVragen` verdwijnt.
- Het resetten van de gebruikte vragen klopt nu niet bij een filter: `gebruikte` bevat ook ID's uit andere categorieën, dus `gebruikte.size >= vragen.length` gaat te vroeg of te laat af. Nieuw:
  ```js
  let beschikbaar = vragen.filter(v => !gebruikte.has(v.id));
  if (beschikbaar.length === 0) {           // alle vragen uit deze pool gehad
    for (const v of vragen) gebruikte.delete(v.id);
    beschikbaar = vragen;
  }
  ```
  Zo blijven gebruikte vragen uit andere kanalen van dezelfde sessie staan.

### 3. Melding als er niets is
In `stuurVraag()` (fase 2): is er geen vraag en is er een filter, dan ephemeral
`❌ Geen waarheidsvragen in de categorie 🔞 18+ van dit kanaal.` (of `doe-opdrachten`). Zonder filter blijft de huidige melding.

### 4. Nummers binnen de categorie
`/waarheid nummer:` en `/doen nummer:` gebruiken de nummers uit `/lijst` (alle vragen van de server). Dat blijft zo. Nieuw: heeft het kanaal een filter en hoort de vraag bij een andere categorie, dan ephemeral
`❌ Vraag 12 hoort bij 👫 Vrienden. In dit kanaal kunnen alleen vragen uit 🔞 18+.`
en geen vraag. Controleer het filter met `game.getCategorieFilter(guildId, channelId)`.

### 5. Categorie zichtbaar in de embed
Voor `buildWaarheidEmbed`, `buildDoenEmbed`, `buildStrafWaarheidEmbed` en `buildStrafDoenEmbed` (geef `vraag.categorie` mee vanuit `stuurVraag`):
- **Footer:** `categorieLabel(categorie)` in plaats van `Waarheid of Doen`, bijv. `🔞 18+ • 3/40 vragen gehad`.
- **Titel bij 18+:** `🔞` erachter, bijv. `🔵 Waarheid 🔞` of `🔴 Doen — Strafopdracht 🔞`. Zo zie je het ook als de footer ingeklapt is (mobiel).
- **Teller in de footer:** met een filter telt het totaal alleen de vragen uit die categorie (`stmts.countVragenByCategorie`: `SELECT COUNT(*) AS cnt FROM vragen WHERE guild_id = ? AND type = ? AND categorie = ?`). Het aantal gehad telt dan ook alleen die categorie: het aantal ID's uit `gebruikte` dat in de pool zit. Geef de pool of de twee getallen mee vanuit `stuurVraag`, zodat de embed niet zelf hoeft te rekenen.

In DM komt dezelfde embed, dus ook daar is de categorie zichtbaar.

### 6. Docs
- `CLAUDE.md`, harde regel 11: de zin "De huidige code voldoet hier nog niet aan" weg.
- `README.md`, sectie "Categorieën en 18+": gekoppeld kanaal zonder vragen in die categorie geeft een melding in plaats van andere vragen; nummers alleen uit de eigen categorie; de categorie staat in de embed.

## Databasewijzigingen
Geen (alleen een nieuwe prepared statement).

## Klaar als
- [ ] `getVraag()` valt nooit terug op andere categorieën.
- [ ] Een gekoppeld kanaal zonder (ongebruikte) vragen in zijn categorie geeft de nieuwe melding, of begint opnieuw als alle vragen uit de categorie gehad zijn.
- [ ] `/waarheid nummer:` en `/doen nummer:` weigeren een vraag uit een andere categorie in een gekoppeld kanaal; zonder koppeling werken alle nummers.
- [ ] Elke waarheid/doen/straf-embed toont de categorie in de footer, en 18+ ook in de titel.
- [ ] De teller in de footer telt binnen de categorie als er een filter is.
- [ ] Zonder koppeling (of met "Categorieën per chat" uit) werkt alles als voorheen, 18+ inbegrepen.
- [ ] Commit `v1.10.0 (fase 3/5) — categorie per kanaal zonder uitzonderingen`, gepusht, `check` groen.

## Teststappen
Server 1, "Categorieën per chat" aan.
1. Koppel kanaal `#test-vrienden` aan `vrienden` en zorg dat er geen doe-opdrachten in `vrienden` zijn. `/doen` → melding "Geen doe-opdrachten in de categorie 👫 Vrienden", geen 18+-opdracht.
2. Voeg twee waarheidsvragen in `vrienden` toe. `/waarheid` drie keer → de twee vragen, daarna begint het opnieuw met die twee. Nooit een andere categorie.
3. `/lijst waarheid`, zoek het nummer van een 18+-vraag. In `#test-vrienden`: `/waarheid nummer:<dat nummer>` → melding. In een niet-gekoppeld kanaal → de vraag verschijnt, met 🔞 in titel en footer.
4. Een 18+-vraag via `/wod` in een ongekoppeld kanaal → `🔵 Waarheid 🔞` en footer `🔞 18+ • …`.
5. DM-modus aan: de DM-embed toont ook de categorie.
6. Zet "Categorieën per chat" uit → alle categorieën verschijnen weer overal.
7. Server 2 (zonder koppelingen): alles door elkaar, zoals altijd.

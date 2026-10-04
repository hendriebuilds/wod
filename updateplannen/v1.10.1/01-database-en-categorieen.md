# Fase 1 — Database en categorieën

## Doel
De migraties lopen in de juiste volgorde, ook bij een lege database. Daarnaast draait het opruimen van duplicaten maar één keer.

Er is één standaardcategorie (`algemeen`) en één vaste lijst met categorieën. Panel, API, CSV-import en `/voeg-toe` accepteren alleen categorieën uit die lijst. Bestaande vragen met een onbekende categorie blijven werken, en het panel markeert ze zodat je ze zelf kunt rechtzetten. De importmelding in het panel staat in de vertaalbestanden.

## Bestanden
- `src/database.js`: migraties, duplicaten
- `src/game.js`: `STANDAARD_CATEGORIE`, `normaliseerCategorie()`, `isGeldigeCategorie()`. Geeft dat een import-cyclus met `server.js`, verplaats `CATEGORIEEN` en deze helpers dan naar een nieuw `src/categorieen.js` en exporteer ze opnieuw vanuit `game.js`.
- `src/server.js`: `POST`/`PUT /api/vragen`, `POST /api/vragen/import`, `POST /api/channel-categorie`, `GET /api/categorieen`, `POST /api/categoriemappen/aanmaken`
- `src/commands/admin/voeg-toe.js`: optie `categorie`
- `admin/src/pages/Vragen.jsx`: standaardcategorie, markering, importmelding
- `admin/src/App.css`: `.cat-badge-ongeldig`
- `admin/src/i18n/nl.js`, `en.js`
- `README.md` (CSV-import, `/voeg-toe`), `CLAUDE.md` (migraties, categorieën)

## Stappen

### 1. Migraties ná het aanmaken van de tabellen
In `src/database.js`:
```js
// Alleen aanroepen met vaste namen uit de code, nooit met invoer van buiten.
function voegKolomToe(tabel, kolom, definitie) {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all().map(k => k.name);
  if (!kolommen.includes(kolom)) {
    db.exec(`ALTER TABLE ${tabel} ADD COLUMN ${kolom} ${definitie}`);
    console.log(`🔧 Migratie: kolom ${tabel}.${kolom} toegevoegd`);
  }
}
```
- Haal de vijf regels `try { db.exec('ALTER TABLE …') } catch {}` weg: `instellingen.auto_categorie_mappen`, `instellingen.categorie_per_chat`, en `user_levels.reroll_teller`, `passen_teller` en `rondes_teller`.
- Zet daarvoor in de plaats aanroepen van `voegKolomToe()` direct ná het laatste `db.exec` met `CREATE TABLE` (het v1.10.0-blok), dus vóór `export const stmts`.
- Gebruik geen lege `catch` meer. Mislukt een migratie echt, dan stopt de start met een duidelijke fout in plaats van stil door te gaan.
- Controleer of het scenario uit `errorcodes/user_levels.md` niet meer kan optreden: start met een lege `DATA_DIR`.

### 2. Duplicaten alleen opruimen als de index nog niet bestaat
```js
const heeftUniekeIndex = db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_vragen_guild_tekst_uniq'"
).get();
if (!heeftUniekeIndex) {
  db.transaction(() => {
    db.exec('DELETE FROM vragen WHERE id NOT IN (SELECT MIN(id) FROM vragen GROUP BY guild_id, LOWER(tekst))');
    db.exec('CREATE UNIQUE INDEX idx_vragen_guild_tekst_uniq ON vragen (guild_id, LOWER(tekst))');
  })();
  console.log('🔧 Migratie: duplicaten opgeruimd en unieke index aangemaakt');
}
```

### 3. Eén lijst, één standaard
Naast `CATEGORIEEN` en `categorieLabel()`:
```js
export const STANDAARD_CATEGORIE = 'algemeen';

// '' of null → standaard; anders getrimd en in kleine letters
export function normaliseerCategorie(waarde) {
  const c = typeof waarde === 'string' ? waarde.trim().toLowerCase() : '';
  return c || STANDAARD_CATEGORIE;
}

export function isGeldigeCategorie(categorie) {
  return Object.hasOwn(CATEGORIEEN, categorie);
}
```
Daarna `grep -rn "'18+'" src`: als standaardwaarde mag `'18+'` niet meer voorkomen. Hij blijft alleen staan als sleutel in `CATEGORIEEN` en waar 18+ echt bedoeld is. `migreerVanJSON()` (de oude `vragen.json`) blijft ongewijzigd; dat is oude data.

### 4. Validatie in de API (`src/server.js`)
- **`POST /api/vragen`:** `type` moet `waarheid` of `doen` zijn. `categorie = normaliseerCategorie(req.body.categorie)`. Is die ongeldig, dan `400 { error: 'Onbekende categorie.', code: 'ongeldige_categorie' }`.
- **`PUT /api/vragen/:id`:** ontbreekt `categorie` (`undefined`), dan blijft de huidige categorie van de vraag staan. Haal de vraag op met `id` en `guild_id`. De fallback `|| '18+'` verdwijnt. Is `categorie` meegegeven, dan normaliseren en valideren zoals bij `POST`.
- **`POST /api/vragen/import`:** per regel:
  - Is `type` ongeldig, `tekst` leeg of `categorie` onbekend, dan telt de regel als `ongeldig` en wordt hij niet ingevoegd. Een lege `categorie` wordt `algemeen`.
  - Een dubbele vraag telt zoals nu als `overgeslagen`.
  - Response: `{ success: true, toegevoegd, overgeslagen, ongeldig }`.
- **`POST /api/channel-categorie`:** de controle "niet leeg en ≤ 50 tekens" wordt `isGeldigeCategorie(normaliseerCategorie(categorie))`, anders 400. Bestaande koppelingen aan een onbekende categorie worden niet aangepast.
- **`GET /api/categorieen`:** geeft `Object.keys(CATEGORIEEN)` terug, dus alle vijf, ook als er nog geen vragen in een categorie zitten. Zo kun je alvast een 18+-kanaal koppelen.
- **`POST /api/categoriemappen/aanmaken`:** maakt alleen kanalen voor categorieën uit `getDistinctCats` die ook geldig zijn.

### 5. `/voeg-toe` met categorie
```js
.addStringOption(opt =>
  opt.setName('categorie').setDescription('In welke categorie?').setRequired(true)
    .addChoices(...Object.entries(CATEGORIEEN).map(([value, c]) => ({ name: `${c.emoji} ${c.naam}`, value })))
)
```
- Gebruik de gekozen categorie bij `insertVraag` in plaats van `'algemeen'`.
- De bevestiging toont de categorie, bijv. `Nieuwe waarheidsvraag toegevoegd als #12 in 🔞 18+:`.
- Ook hier controleren met `isGeldigeCategorie()` (een command kan via de API met een andere waarde binnenkomen).

### 6. Panel (`admin/src/pages/Vragen.jsx`)
- Zet bij de constante `CATEGORIEEN` in het panel het commentaar `// Gelijk houden met CATEGORIEEN in src/game.js`. Controleer dat het precies de vijf waarden zijn.
- Standaard voor een nieuwe vraag: `algemeen`.
- **Markering:** staat `item.categorie` niet in de lijst, dan:
  - de badge krijgt `className="cat-badge cat-badge-ongeldig"`, met tekst `⚠️ {item.categorie}` en `title={t('vragen.onbekendeCategorie')}`
  - in het bewerkveld een extra `<option value={editCat} disabled>⚠️ {editCat}</option>`, zodat de select niet ongemerkt een andere waarde toont
  - `opslaan()` controleert vóór de API-aanroep of `editCat` geldig is, en geeft anders een foutmelding met `t('vragen.kiesCategorie')`
- **Importmelding:** de hardcoded tekst `✅ ${result.toegevoegd} vragen toegevoegd…` vervangen door:
  ```js
  const msg = [
    t('vragen.importToegevoegd', { count: result.toegevoegd }),
    result.overgeslagen > 0 && t('vragen.importOvergeslagen', { count: result.overgeslagen }),
    result.ongeldig > 0 && t('vragen.importOngeldig', { count: result.ongeldig }),
  ].filter(Boolean).join(' ');
  ```
- Is `vragen.geimporteerd` daarna nergens meer in gebruik, haal hem dan uit beide vertaalbestanden.

CSS in `App.css`:
```css
.cat-badge-ongeldig { border-style: dashed; color: var(--orange); border-color: var(--orange); background: transparent; }
```
De inline `style` met `catKleur()` mag dan niet over deze klasse heen gaan. Geef bij een ongeldige categorie dus geen `style` mee.

### 7. Vertaalsleutels

| Sleutel | nl | en |
|---|---|---|
| `vragen.importToegevoegd` | `✅ {count} vragen toegevoegd.` | `✅ {count} questions added.` |
| `vragen.importOvergeslagen` | `{count} overgeslagen (dubbel).` | `{count} skipped (duplicate).` |
| `vragen.importOngeldig` | `{count} ongeldig (type, categorie of lengte).` | `{count} invalid (type, category or length).` |
| `vragen.onbekendeCategorie` | `Onbekende categorie. Kies een categorie uit de lijst.` | `Unknown category. Pick a category from the list.` |
| `vragen.kiesCategorie` | `Kies eerst een geldige categorie.` | `Pick a valid category first.` |
| `vragen.csvHint` | `CSV-formaat: kolommen \`type\`, \`tekst\`, \`categorie\`. Categorie is optioneel (standaard algemeen) en moet algemeen, vrienden, koppels, feest of 18+ zijn. Exporteer eerst voor een voorbeeld.` | `CSV format: columns \`type\`, \`tekst\`, \`categorie\`. Category is optional (default algemeen) and must be algemeen, vrienden, koppels, feest or 18+. Export first for an example.` |

### 8. Docs
- **`README.md`, sectie CSV-import:**
  - Standaard is `algemeen`, toegestane waarden staan erbij.
  - Regels met een onbekend type, een lege tekst of een onbekende categorie tellen als ongeldig.
  - Na de import zie je toegevoegd, overgeslagen en ongeldig.
- **`README.md`, tabel Beheer:** `/voeg-toe type tekst categorie`.
- **`CLAUDE.md`:**
  - Nieuwe kolommen gaan via `voegKolomToe()`, ná alle `CREATE TABLE`.
  - Categorieën alleen uit `CATEGORIEEN` (met `isGeldigeCategorie()`), standaard `STANDAARD_CATEGORIE`.
  - Het schema heeft nog `DEFAULT '18+'`; die wordt nooit gebruikt, omdat elke insert de categorie meegeeft.

## Databasewijzigingen
Geen nieuwe tabellen of kolommen. De migraties zijn herschikt en de duplicaten worden eenmalig opgeruimd.

## Klaar als
- [ ] In `src/database.js` staat geen `ALTER TABLE` meer in een lege `catch`. Alle kolommigraties staan ná de `CREATE TABLE`-blokken.
- [ ] Een start met een lege `DATA_DIR` lukt zonder fouten. Een start met de bestaande database logt geen migraties (alles bestaat al).
- [ ] De `DELETE` op duplicaten draait alleen als `idx_vragen_guild_tekst_uniq` ontbreekt.
- [ ] `grep -rn "'18+'" src` toont geen standaardwaarden meer.
- [ ] `POST`/`PUT /api/vragen` weigeren een onbekende categorie met 400 `ongeldige_categorie`. Een `PUT` zonder `categorie` laat de categorie staan.
- [ ] De CSV-import geeft `toegevoegd`, `overgeslagen` en `ongeldig` terug, en zet een lege categorie op `algemeen`.
- [ ] `/voeg-toe` heeft een verplichte keuzelijst `categorie`, en de vraag komt in die categorie.
- [ ] `POST /api/channel-categorie` weigert een onbekende categorie. `GET /api/categorieen` geeft de vijf vaste categorieën.
- [ ] Het panel markeert vragen met een onbekende categorie, en opslaan dwingt een geldige keuze af.
- [ ] De importmelding komt uit `t()`. Alle nieuwe sleutels staan in `nl.js` én `en.js`.
- [ ] `cd admin && npm run build` geeft geen fouten.
- [ ] README en CLAUDE.md zijn bijgewerkt.
- [ ] Commit `v1.10.1 (fase 1/3) — categorieën eenduidig en gevalideerd, migraties op volgorde`, gepusht, `check` groen.

## Teststappen
Gebruik server 1 en een testserver 2.

1. **Lege database (lokaal):** start met een lege `DATA_DIR`. De bot start zonder fouten. Stop en start opnieuw: er verschijnen geen `🔧 Migratie`-regels meer.
2. **Bestaande database:** start met een kopie van de echte `bot.db`. Er verschijnen geen migratieregels, en vragen, punten en sessies zijn er nog.
3. **`/voeg-toe`:** op server 1 `/voeg-toe type:Waarheid tekst:Testvraag categorie:👫 Vrienden`. De bevestiging noemt 👫 Vrienden, en het panel toont de vraag onder `vrienden`.
4. **Panel toevoegen:** een nieuwe vraag staat standaard op `algemeen`.
5. **CSV-import:** importeer dit bestand:
   ```csv
   type,tekst,categorie
   waarheid,"Test zonder categorie",
   waarheid,"Test met hoofdletters",Feest
   waarheid,"Test met eigen categorie",spicy
   kapot,"Test met fout type",algemeen
   waarheid,"Test zonder categorie",
   ```
   De melding is: 2 toegevoegd, 1 overgeslagen (dubbel), 2 ongeldig. De eerste vraag staat op `algemeen`, de tweede op `feest`. Wissel naar EN: de melding is Engels.
6. **Onbekende categorie in het panel:** zet op server 2 een vraag met een onbekende categorie in de database (via de container, zie hieronder). Het panel toont `⚠️ spicy` met een stippelrand. Bewerk de vraag: de select toont `⚠️ spicy` (niet te kiezen), en opslaan zonder een andere keuze geeft "Kies eerst een geldige categorie". Kies `feest` en sla op: de markering is weg.
   ```sh
   docker exec -it <CONTAINER> node --input-type=module -e "import D from 'better-sqlite3'; new D('/app/data/bot.db').prepare('INSERT INTO vragen (guild_id, type, tekst, categorie) VALUES (?, ?, ?, ?)').run('<SERVER-2-ID>', 'waarheid', 'Testvraag met eigen categorie', 'spicy')"
   ```
7. **Instellingen:** de keuzelijst bij een kanaalkoppeling toont de vijf categorieën, ook een categorie zonder vragen.
8. **Scheiding:** de vragen uit stap 3 en 5 staan niet op server 2.

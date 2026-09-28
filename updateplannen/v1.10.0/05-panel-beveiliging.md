# Fase 5 — Panel: sessies in SQLite en CSRF, daarna afronden

## Doel
Een login van het panel overleeft een herstart van de container, en het geheugen loopt niet meer vol met sessies. Schrijvende API-aanroepen komen alleen nog van het panel zelf (CSRF-bescherming). Daarna wordt v1.10.0 afgerond: versie, docs en de release via GitHub Actions.

## Bestanden
- `src/sessionStore.js`: **nieuw**
- `src/database.js`: tabel `panel_sessies` en stmts
- `src/server.js`: store koppelen, `vereisZelfdeOrigin`, JSON-limiet, import als JSON
- `admin/src/api.js`: `importVragen` als JSON, `reqText` weg
- `VERSION`, `package.json`, `README.md`, `CLAUDE.md`, `BACKLOG.md`

## Stappen

### 1. Sessie-store in SQLite
Tabel:
```sql
CREATE TABLE IF NOT EXISTS panel_sessies (
  sid      TEXT PRIMARY KEY,
  sess     TEXT NOT NULL,      -- JSON
  verloopt INTEGER NOT NULL    -- ms sinds epoch
);
CREATE INDEX IF NOT EXISTS idx_panel_sessies_verloopt ON panel_sessies(verloopt);
```
(Bewust niet `sessies`, om verwarring met `wod_sessies` te voorkomen.)

`src/sessionStore.js`:
```js
import session from 'express-session';
export class SqliteStore extends session.Store {
  get(sid, cb)          // rij ophalen; verlopen → verwijderen en cb(null, null); JSON.parse in try/catch
  set(sid, sess, cb)    // upsert; verloopt = sess.cookie.expires ?? nu + 24 uur
  destroy(sid, cb)
  touch(sid, sess, cb)  // alleen verloopt bijwerken
}
```
- Elke methode in `try/catch` en de fout via `cb(err)` doorgeven (harde regel 9).
- Opruimen: `setInterval(() => DELETE FROM panel_sessies WHERE verloopt < ?, 15 * 60 * 1000).unref()`, met `try/catch` en een logregel.
- In `server.js`: `store: new SqliteStore()` in de `session()`-opties. Verder blijven de cookie-instellingen gelijk.
- Er komt **geen package** bij.

Let op: `req.session.guilds` en `activeGuildId` staan in de sessie en gaan nu mee naar SQLite. De rechtencache van `heeftToegang()` (60 s) blijft in het geheugen; dat is prima.

### 2. CSRF-bescherming
Middleware `vereisZelfdeOrigin` in `server.js`, na `express.json()`, vóór alle routes:
- Geldt voor methodes buiten `GET`, `HEAD` en `OPTIONS` op paden die beginnen met `/api/` en op `POST /auth/logout`.
- Toegestane origin: `new URL(config.frontendUrl).origin` (het object `config` uit `src/config.js`), elke keer uitgelezen (Configuratie kan hem wijzigen).
- Header `Origin` aanwezig → moet gelijk zijn. Ontbreekt hij, dan `Referer` gebruiken (`new URL(referer).origin`, in `try/catch`). Ontbreken beide of klopt het niet → `403 { error: 'Verzoek niet toegestaan.', code: 'csrf' }` en een logregel met methode en pad (geen headers of cookies loggen).
- Heeft het verzoek een body (`content-length > 0` of `transfer-encoding`), dan moet `Content-Type` `application/json` zijn, anders `415 { error: 'Alleen JSON.', code: 'content_type' }`.

Lokaal ontwikkelen: de Vite-devserver stuurt `Origin: http://localhost:5173` mee. Staat `frontendUrl` lokaal op dat adres, dan werkt het. Vermeld dit in `README.md`.

### 3. CSV-import als JSON
- `server.js`: `express.json({ limit: '2mb' })` als globale parser (was 100 kB). `express.text({ type: '*/*' })` bij de import-route weg.
- `POST /api/vragen/import` leest `req.body.csv` (string, verplicht, anders 400 met de bestaande foutmelding). De rest van de verwerking blijft gelijk.
- `admin/src/api.js`: `importVragen: (csvText) => req('POST', '/api/vragen/import', { csv: csvText })`, en `reqText` verwijderen. `Vragen.jsx` hoeft niet te veranderen.
- Panel bouwen.

### 4. Afronden v1.10.0
- `VERSION` en `package.json` → `1.10.0`. Dat start na de push de release in Actions.
- `README.md`: controleren dat alles uit fase 2–4 erin staat. Nieuw uit deze fase: je blijft ingelogd na een herstart, en het panel werkt alleen via `<PANEL-URL>` (CSRF).
- `CLAUDE.md`: tabel `panel_sessies`, `src/sessionStore.js` in "Structuur", bij "Toegangsregel" de Origin-controle en JSON-only, bij de API-routes `POST /api/vragen/import` (JSON `{ csv }`).
- `BACKLOG.md`: alle items uit de scope van `00-overzicht.md` op `[x]`, ook de dubbele elders (bijv. "GitHub Actions" in ⚙️). Het item "`dockerignore` heet geen `.dockerignore`" afvinken met de opmerking dat het al zo heette en de inhoud is aangevuld. Blok `## ✅ Uitgebracht in v1.10.0 — Punten eerlijk` toevoegen. Focus-release "Punten eerlijk" weghalen; bij "Standaard doorvoeren" de afgeronde onderdelen weghalen.
- Commit `v1.10.0 — punten eerlijk`, pushen.
- In Actions controleren: `check` en `release` groen, tag `v1.10.0` bestaat, `:1.10.0` en `:latest` staan op GHCR. Resultaat in de samenvatting.

## Databasewijzigingen
Nieuwe tabel `panel_sessies` met index.

## Klaar als
- [ ] Na een herstart van de bot ben je in het panel nog ingelogd, met dezelfde actieve server.
- [ ] Verlopen sessies verdwijnen uit `panel_sessies`.
- [ ] Een `POST`/`PUT`/`DELETE` naar `/api/…` zonder of met een verkeerde `Origin` geeft 403; met een body die geen JSON is 415.
- [ ] Alles in het panel werkt nog: vragen toevoegen, bewerken, verwijderen, CSV-import en -export, instellingen, sessies, uitloggen, van server wisselen.
- [ ] CSV-import van een bestand van ~1 MB lukt.
- [ ] `VERSION` en `package.json` staan op `1.10.0`; README, CLAUDE.md en BACKLOG.md zijn bijgewerkt.
- [ ] Na de push zijn beide jobs in Actions groen en staat het image `:1.10.0` op GHCR.

## Teststappen
1. **Ingelogd blijven:** log in op het panel, herstart de container op Unraid, ververs de pagina → nog steeds ingelogd, zelfde server.
2. **Uitloggen** → daarna ook na een herstart uitgelogd.
3. **CSRF:** start een ronde in Discord, zodat er een actieve sessie is. Open in dezelfde browser een willekeurige andere website en voer in de console uit:
   `fetch('<PANEL-URL>/api/reset', { method: 'POST', credentials: 'include', mode: 'no-cors' })`
   Controleer daarna in het panel onder Sessies dat de sessie nog actief is, en in de log dat er een regel over een geweigerd verzoek staat.
4. **Import:** importeer een CSV in het panel → toegevoegd en overgeslagen worden getoond, zoals voorheen.
5. **Alles doorklikken:** elke pagina van het panel, iets opslaan, NL/EN wisselen.
6. **Release:** onder *Actions* → *Docker image* zijn beide jobs groen; onder *Tags* staat `v1.10.0`.
7. **Deploy:** Unraid → *Check for updates* → updaten. Eenmalig opnieuw inloggen. Speel een ronde in Discord (fase 2), test een gekoppeld kanaal (fase 3) en `/strafpunten` (fase 4) nog één keer op de productieversie.
8. **Server 2:** in het panel wisselen naar server 2 en terug werkt; data blijft gescheiden.

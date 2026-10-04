# Fase 3 — Container en Actions, daarna afronden

## Doel
- Het image draait in productiemodus, en de API geeft bij fouten altijd JSON terug in plaats van een HTML-pagina met een stacktrace.
- Docker en Unraid zien of de bot gezond is.
- Bij stoppen slaat de bot alles op en sluit hij netjes af.
- De workflow draait op actions met Node 24 en maakt bij elke nieuwe versie een GitHub Release.

Daarna wordt v1.10.1 afgerond.

## Bestanden
- `Dockerfile`: `NODE_ENV`, `HEALTHCHECK`
- `src/server.js`: `GET /health`, error-handler, `startServer()` geeft de server terug
- `index.js`: nette afsluiting
- `.github/workflows/docker.yml`: action-versies, stap GitHub Release
- `VERSION`, `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `BACKLOG.md`

## Stappen

### 1. `NODE_ENV=production`
In stage 2 van de `Dockerfile`, direct na `FROM node:22-alpine`:
```dockerfile
ENV NODE_ENV=production
```
Lokaal blijft `NODE_ENV` leeg, dus daar krijg je de gewone ontwikkelmeldingen.

### 2. `GET /health`
In `src/server.js`, **vóór** `express-session`, zodat een healthcheck geen sessie aanmaakt:
```js
app.get('/health', (req, res) => {
  const klaar = _client?.isReady() ?? false;
  res.status(klaar ? 200 : 503).json({ status: klaar ? 'ok' : 'starting' });
});
```
- Geen versie, aantal servers of andere details in de response, want de route is via de reverse proxy publiek bereikbaar.
- Log deze route niet, zodat er niet elke 30 seconden een regel bijkomt.

### 3. Healthcheck in de `Dockerfile`
Alpine heeft `wget` via busybox, dus er is geen extra package nodig:
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:${ADMIN_PORT:-3001}/health" || exit 1
```

### 4. JSON-error-handler
Helemaal onderaan in `src/server.js`, na de statische bestanden en de catch-all:
```js
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ongeldige JSON.', code: 'ongeldige_json' });
  if (err.type === 'entity.too.large')   return res.status(413).json({ error: 'Verzoek te groot.', code: 'te_groot' });
  console.error(`❌ Fout in ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Er ging iets mis.', code: 'serverfout' });
});
```
Log geen headers, cookies of body (harde regel 2).

### 5. Nette afsluiting
`startServer()` geeft het resultaat van `app.listen(...)` terug. In `index.js`:
```js
const server = startServer();
let bezigMetAfsluiten = false;

async function sluitAf(signaal) {
  if (bezigMetAfsluiten) return;
  bezigMetAfsluiten = true;
  console.log(`🛑 ${signaal} ontvangen, bot sluit af…`);
  const noodstop = setTimeout(() => { console.error('⏱️ Afsluiten duurt te lang, geforceerd stoppen.'); process.exit(1); }, 8000);
  noodstop.unref();
  try { for (const id of game.sessieCache.keys()) game.saveSessieCache(id); } catch (err) { console.error('❌ Sessies opslaan bij afsluiten mislukt:', err); }
  try { await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }); } catch (err) { console.error('❌ Server sluiten mislukt:', err); }
  try { await client.destroy(); } catch (err) { console.error('❌ Discord-verbinding sluiten mislukt:', err); }
  try { db.close(); } catch (err) { console.error('❌ Database sluiten mislukt:', err); }
  console.log('👋 Afgesloten.');
  process.exit(0);
}
process.on('SIGTERM', () => sluitAf('SIGTERM'));
process.on('SIGINT',  () => sluitAf('SIGINT'));
```
- Na `db.close()` mag er niets meer naar de database schrijven. Het opruim-interval van `panel_sessies` is al `unref()`. Komt er toch nog een verzoek binnen, dan vangt de error-handler het af.
- De `CMD` gebruikt al de exec-vorm (`["node", "index.js"]`), dus Node is PID 1 en krijgt `SIGTERM` direct.

### 6. Actions naar Node 24 (`.github/workflows/docker.yml`)
- `actions/checkout` en `actions/setup-node` naar de nieuwste major, minimaal `@v5`. Die draaien op Node 24.
- `docker/setup-buildx-action`, `docker/login-action` en `docker/build-push-action`: zoek per action op de releasepagina de nieuwste major op en lees de changelog op breaking changes in de gebruikte inputs:
  - `context`, `push`, `tags`, `labels`, `cache-from` en `cache-to`
  - `registry`, `username` en `password`
- Vul de versie niet uit je hoofd in.
- `setup-node` houdt `node-version: 22`. Dat is de runtime voor de controle van de bot, en die blijft Node 22.
- `runs-on: ubuntu-latest` blijft staan (zie teststap 7).

### 7. GitHub Release
Nieuwe stap in de job `release`, ná "Git-tag aanmaken":
```yaml
      - name: GitHub Release
        if: steps.nodig.outputs.bouwen == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          V: ${{ needs.check.outputs.version }}
        run: |
          if gh release view "v$V" > /dev/null 2>&1; then
            echo "Release v$V bestaat al."
          elif [ -f "updateplannen/v$V/00-overzicht.md" ]; then
            gh release create "v$V" --title "v$V" --notes-file "updateplannen/v$V/00-overzicht.md" --verify-tag
          else
            gh release create "v$V" --title "v$V" --generate-notes --verify-tag
          fi
```
- De voorwaarde is `bouwen` (niet `tag`). Mislukt de release, dan kun je hem met *Run workflow* en `force` alsnog laten aanmaken.
- `contents: write` staat al in de job. `gh` zit standaard op de runner.

### 8. Afronden
- **Versie:** `npm version 1.10.1 --no-git-tag-version` (werkt `package.json` en `package-lock.json` bij), en `VERSION` op `1.10.1`.
- **`README.md`:**
  - `GET /health` en de healthcheck (Unraid toont *healthy*)
  - nette afsluiting
  - `NODE_ENV=production` in het image
  - een release per versie onder *Releases*
- **`CLAUDE.md`:**
  - `GET /health` bij de API-routes, met de opmerking dat de route vóór de sessie staat en geen details geeft
  - de error-handler: nieuwe routes geven fouten via `next(err)` of zelf als JSON
  - werkwijze stap 8: de workflow maakt ook de GitHub Release, met `00-overzicht.md` als tekst
- **`BACKLOG.md`:**
  - Vink af met `(v1.10.1)`: de zes bugs uit 🐛 behalve de beurtrotatie, plus `NODE_ENV`, healthcheck, nette afsluiting, Actions naar Node 24 en GitHub Release.
  - Voeg onder 🐛 toe als afgevinkt: `[x] S **Importmelding in het panel hardcoded** (v1.10.1)`.
  - **Beurtrotatie per server in plaats van per sessie:** omvang `M` (er komt een tabel bij), en noem het item in de focus-release "Timeout & beurten".
  - Nieuw item onder ⚙️:
    ```
    - [ ] `M` **Bot naar Node 24**
      Node 24 is LTS. `node:24-alpine` in beide stages, `node-version: 24` in de workflow, better-sqlite3 opnieuw bouwen en testen. Daarna de stack in CLAUDE.md en de projectinstructies bijwerken.
    ```
- **Commit:** `v1.10.1 — bugs opgelost, categorieën gevalideerd, Actions op Node 24`, en pushen.
- **Controleren:** onder *Actions* zijn beide jobs groen en verschijnen geen annotaties over Node 20. Op GHCR staat `:1.10.1`, onder *Releases* staat `v1.10.1`.

## Databasewijzigingen
Geen.

## Klaar als
- [ ] Het image heeft `NODE_ENV=production` en een `HEALTHCHECK`.
- [ ] `GET /health` geeft `200 {"status":"ok"}` zodra de bot verbonden is, en `503` daarvoor. Er wordt geen sessie-cookie gezet.
- [ ] Ongeldige JSON naar `/api/…` geeft een 400 in JSON, en een body boven 2 MB een 413 in JSON. Er is nergens HTML met een stacktrace.
- [ ] `docker stop` geeft in de log `🛑 SIGTERM ontvangen` en `👋 Afgesloten.`, binnen 8 seconden en zonder `⏱️`.
- [ ] Na een herstart midden in een sessie zijn de gebruikte vragen bewaard: je krijgt geen vraag die al geweest is.
- [ ] De workflow gebruikt alleen actions die op Node 24 draaien, en `setup-node` gebruikt `node-version: 22`.
- [ ] De workflow maakt een GitHub Release met `00-overzicht.md` als tekst.
- [ ] `VERSION`, `package.json` en `package-lock.json` staan op `1.10.1`. README, CLAUDE.md en BACKLOG.md zijn bijgewerkt.
- [ ] Na de push zijn beide jobs groen, staat `:1.10.1` op GHCR en staat `v1.10.1` onder *Releases*.

## Teststappen
1. **Release:** onder *Actions* → *Docker image* zijn beide jobs groen. Open een job: er staat geen waarschuwing over Node 20 bij de annotaties. Onder *Releases* staat `v1.10.1`, met het overzicht als tekst.
2. **Deploy:** Unraid → *Check for updates* → updaten. Na ongeveer 30 seconden staat de container op **healthy** (Docker-tab, of `docker ps`).
3. **Health:** open `<PANEL-URL>/health` in een privévenster. Je krijgt `{"status":"ok"}`, en in de devtools zie je geen cookie `wod.sid` voor die request.
4. **Foutafhandeling:** ingelogd in het panel, in de browserconsole:
   ```js
   fetch('/api/vragen', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{kapot' }).then(r => r.status + ' ' + r.headers.get('content-type'))
   ```
   Het resultaat is `400 application/json…`.
5. **Afsluiten:** start een ronde in Discord en speel twee vragen. Stop de container in Unraid. In de log staan `🛑 SIGTERM ontvangen…` en `👋 Afgesloten.` Start de container weer: de sessie loopt door, en de twee vragen komen niet direct terug.
6. **Panel na herstart:** je bent nog ingelogd (sessies in SQLite sinds v1.10.0).
7. **Ubuntu 26 (na 19 oktober):** controleer bij de eerste run na die datum dat beide jobs groen zijn. Gaat er iets mis, zet `runs-on` dan tijdelijk op `ubuntu-24.04` en maak er een backlog-item van.
8. **Server 2:** wissel in het panel naar server 2, speel een ronde en controleer dat de data gescheiden is.

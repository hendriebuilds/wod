# CLAUDE.md — WoD Bot

Discord-bot voor "Waarheid of Doen" op meerdere servers. Naast het spel zijn er "Nooit heb ik…", beurtrotatie, sessies, profielen met punten, levels en achievements, en de fun-tests liefdestaal, persoonlijkheid en relatietest. Beheer gaat via een React-panel met Discord-login, per server, en voor een deel via slash commands.

Dit bestand vervangt de oude `CLAUDE.md`.

## Waar staat wat
- **Plannen:** `updateplannen/<versie>/`. Lees altijd eerst `00-overzicht.md` en daarna alleen het fasebestand waaraan je werkt. Oudere plannen (t/m v1.9.2) staan als losse bestanden in `updateplannen/`.
- **Foutmeldingen:** `errorcodes/`
- **Backlog:** `BACKLOG.md`
- **Versie:** `VERSION` (en `version` in `package.json`, altijd gelijk houden)
- **Installatie en gebruik:** `README.md`

## Stack
Node.js 22 + discord.js v14 als ES modules (`"type": "module"`), Express voor API en panel op één poort, eigen Discord OAuth2-flow met `fetch` en `express-session`, SQLite via better-sqlite3, React 18 + Vite voor het panel, Docker (`node:22-alpine`, multi-stage).

Productie draait op Unraid als Docker-container, met het panel achter een reverse proxy (HTTPS). De database staat in een volume op `DATA_DIR`.

## Structuur
- `index.js` — laadt eerst `dotenv/config` en `src/env.js`; client (intent `Guilds`, `allowedMentions: { parse: [] }`), globale fout-handlers, command loader (`src/commands/{game,fun,admin}`, opgeslagen als `{ mod, cat }`), globale registratie van slash commands bij `ready`, guild-events, `interactionCreate` (in `try/catch`, rechtencheck voor admin commands, dispatch naar commands en `handleButton`), start server en login
- `src/env.js` — controle van verplichte omgevingsvariabelen bij het starten (stopt met exitcode 1)
- `src/permissions.js` — `isGuildAdmin(interaction)` (*Server beheren*) en de melding `GEEN_RECHTEN`
- `src/interactionError.js` — `replyError()`: fout loggen en de speler een ephemeral foutmelding geven
- `src/config.js` — `config.json` laden/opslaan (`redirectUri`, `frontendUrl`), `SUPERADMIN_IDS`, `isSuperAdmin()`
- `src/database.js` — tabellen en migraties, alle prepared statements in `stmts`, `dbGetInstellingen()`, standaard "Nooit"-stellingen, `syncGuildToDb()`, eenmalige migratie van `vragen.json`/`settings.json`
- `src/game.js` — sessie-cache, beurtrotatie, `getVraag()`, categoriefilter per kanaal, cooldown (per `guildId:userId`), data van de fun-tests, `LEVELS`, `voegPuntenToe()`, `checkAchievements()`
- `src/embeds.js` — alle embeds en knoppenrijen (`build*Embed`, `build*Buttons`)
- `src/buttons.js` — `handleButton()`: alle knoppen, punten, level-up en achievement-meldingen
- `src/server.js` — Express-app: auth, alle `/api`-routes, statische bestanden van het panel
- `src/commands/admin/` — `voeg-toe`, `verwijder`, `lijst`, `reload`, `reset`, `sessie`
- `src/commands/game/` — `wod`, `waarheid`, `doen`, `beurt`, `nooit`, `statistieken`, `profiel`, `ranglijst`, `achievements`
- `src/commands/fun/` — `liefdestaal`, `persoonlijkheid`, `relatietest`
- `admin/src/` — `main.jsx`, `App.jsx`, `LanguageContext.jsx` (`t()`, taal in `localStorage`), `api.js` (alle API-aanroepen), `App.css`
- `admin/src/components/Layout.jsx` — navigatie, serverkeuze, taalknop; pagina "Servers" alleen voor superadmins
- `admin/src/pages/` — `Login`, `Vragen`, `Nooit`, `Sessies`, `Statistieken`, `Ranglijst`, `Instellingen`, `Configuratie`, `Servers`
- `admin/src/i18n/` — `nl.js` en `en.js`, dezelfde sleutels
- `Dockerfile`, `.dockerignore`, `build-and-push.sh` (noodoptie), `config.json`
- `.github/workflows/docker.yml` — GitHub Actions: `check` (versies gelijk, syntax, panel bouwt) en `release` (image bouwen en pushen bij een nieuwe `VERSION` op `main`, git-tag `v<versie>`)
- `package-lock.json`, `admin/package-lock.json` — lock files, altijd meecommitten

Werk deze lijst bij zodra er bestanden bijkomen.

### Database (`$DATA_DIR/bot.db`)
Alles behalve `bot_servers` heeft een `guild_id`.
| tabel | inhoud |
|---|---|
| `vragen` | `type` (`waarheid`/`doen`), `tekst`, `categorie`, `dm_modus`. UNIQUE-index op `(guild_id, LOWER(tekst))` |
| `instellingen` | één rij per server, zie hieronder |
| `nooit_stellingen` | eigen "Nooit heb ik…"-stellingen; leeg = standaardlijst uit `database.js` |
| `wod_sessies` | `channel_id`, `naam`, `status` (`actief`/`gepauzeerd`/`beeindigd`), gebruikte vragen (JSON), tellers, `reroll_teller` (JSON) |
| `actieve_sessie` | welke sessie actief is per `(guild_id, channel_id)` |
| `channel_categorie` | koppeling kanaal → vraagcategorie |
| `user_levels` | `punten`, `level`, `reroll_teller`, `passen_teller`, `rondes_teller` per speler per server |
| `user_achievements` | behaalde achievements met `behaald_op` |
| `bot_servers` | servers waar de bot in zit (naam, icoon, leden, eigenaar), voor de Servers-pagina |

### Instellingen per server (tabel `instellingen`, panel → Instellingen)
| kolom | beschrijving | standaard |
|---|---|---|
| `cooldown_ms` | wachttijd tussen knopklikken per gebruiker (0–10000) | `1500` |
| `dm_modus` | alle vragen via DM | `0` |
| `auto_categorie_mappen` | categoriemappen zijn aangemaakt/ingeschakeld | `0` |
| `categorie_per_chat` | vragen filteren op de categorie van het kanaal | `0` |

### Knoppen (custom IDs)
- `kies_waarheid`, `kies_doen`, `kies_random`
- `reroll_waarheid`, `reroll_doen`, `passen_waarheid`, `passen_doen`, `nieuwe_ronde`
- `nooit_wel_<id>`, `nooit_nooit_<id>`, `nooit_sluit_<id>` (`<id>` = interaction-ID van `/nooit`)
- `lt_A`, `lt_B` (liefdestaal), `pt_A`, `pt_B` (persoonlijkheid)
- `rt_start_<id>`, `rt_A_<id>`, `rt_B_<id>` (relatietest)
- `verwijder_ja_<vraagId>` (alleen *Server beheren*), `verwijder_nee`

Nieuwe knoppen hier toevoegen.

### Slash commands
Globaal geregistreerd bij elke start (guild commands worden daarbij leeggemaakt).
- **Admin** (`setDefaultMemberPermissions(ManageGuild)`): `/voeg-toe type tekst`, `/verwijder type nummer`, `/lijst [type]`, `/reload`, `/reset`, `/sessie starten|lijst|wisselen|pauzeren|hervatten|stoppen|info`
- **Spel:** `/wod [speler]`, `/waarheid [nummer]`, `/doen [nummer]`, `/beurt toevoegen|verwijder|lijst|reset|volgende` (`verwijder` en `reset` alleen met *Server beheren*), `/nooit [stelling]`, `/statistieken`, `/profiel [speler]`, `/ranglijst`, `/achievements`
- **Fun:** `/liefdestaal`, `/persoonlijkheid`, `/relatietest speler`

### Punten en levels
| actie | punten |
|---|---|
| `/wod` | +5 |
| Nieuwe ronde | +5 |
| Reroll | −5 |
| Passen | −7 |
| Stemmen bij `/nooit` | +3 |
| `/relatietest` voltooid | +15 (beide spelers) |

Punten gaan nooit onder 0. Levels in `LEVELS` (`src/game.js`): Lafaard 0 · Deelnemer 50 · Durfal 150 · Avonturier 350 · Onthulling 700 · Verleider 1200 · Kampioen 2000 · Legenda 3500. Achievements in `checkAchievements()` (`src/game.js`) en de lijst in `buildAchievementsEmbed()` (`src/embeds.js`).

### Toegangsregel
- **Panel:** bij login krijgt de sessie de servers waar de bot in zit én de gebruiker *Server beheren* (`0x20`) heeft. Superadmins (`SUPERADMIN_IDS`) krijgen alle servers. De actieve server staat in `req.session.activeGuildId`.
- **Routes:** `requireAuth` (ingelogd), `requireGuild` (server gekozen én rechten opnieuw gecontroleerd via `heeftToegang()`, cache 60 s; bij verlies 403 `geen_toegang_server` of 401), `requireSuperAdmin` (superadmin). `POST /api/guild` controleert ook via `heeftToegang()`. Een tijdelijke Discord-fout geeft 503 en logt niemand uit.
- **Admin commands en -knoppen:** `setDefaultMemberPermissions(ManageGuild)` bepaalt wie ze ziet; `interactionCreate` (voor `src/commands/admin/*`), `verwijder_ja_<id>` en `/beurt verwijder|reset` controleren zelf met `isGuildAdmin()`.
- **Login:** OAuth met `state`, nieuwe sessie-ID na inloggen, cookie `wod.sid` (`HttpOnly`, `SameSite=Lax`, `Secure` als `frontendUrl` https is). Fouten gaan naar `?error=geen_toegang|ongeldige_login|login_mislukt`.

### API-routes (`src/server.js`)
- **Auth:** `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/logout`
- **Servers kiezen:** `GET /api/guilds`, `POST /api/guild`
- **Vragen:** `GET/POST /api/vragen`, `PUT/DELETE /api/vragen/:id`, `GET /api/vragen/export`, `POST /api/vragen/import` (CSV als tekst)
- **Nooit:** `GET/POST /api/nooit`, `PUT/DELETE /api/nooit/:id`
- **Sessies en statistieken:** `GET /api/sessies`, `DELETE /api/sessies/:id`, `GET /api/statistieken`, `POST /api/reset`, `POST /api/reload`, `GET /api/ranglijst`
- **Instellingen:** `GET/PUT /api/instellingen`, `POST /api/reset-config`, `GET/POST /api/channel-categorie`, `DELETE /api/channel-categorie/:channelId`, `GET /api/kanalen`, `GET /api/categorieen`, `POST /api/categoriemappen/aanmaken`
- **Configuratie:** `GET/PUT /api/config` (`requireSuperAdmin`; `PUT` valideert beide URL's)
- **Superadmin:** `GET /api/servers`, `DELETE /api/servers/:guildId` (bot verlaat de server)
- Alles daarbuiten: `admin/dist` (React-app)

## Omgevingsvariabelen
| Variabele | Beschrijving | Standaard |
|---|---|---|
| `DISCORD_TOKEN` | Bot token | vereist |
| `DISCORD_CLIENT_ID` | OAuth2 client ID (Application ID) | vereist |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret | vereist |
| `SESSION_SECRET` | Express-sessie secret, minimaal 32 tekens | vereist |
| `SUPERADMIN_IDS` | Discord user-ID's, kommagescheiden (oud: `SUPERADMIN_ID`) | leeg |
| `ADMIN_PORT` | Poort van panel en API | `3001` |
| `DATA_DIR` | Map voor `bot.db` | `./data` (in de container `/app/data`) |

In `config.json` (via het panel onder Configuratie): `redirectUri` (`<PANEL-URL>/auth/callback`) en `frontendUrl` (`<PANEL-URL>`).

## Harde regels
1. **Nooit infrastructuurdetails in de repo, in Discord-berichten of op het panel.** Geen IP-adressen, hostnames, domeinen, servernamen of netwerkindelingen, ook niet in docs, plannen, seed-data, `config.json` of commentaar. Gebruik placeholders zoals `<UNRAID-HOST>`, `<PANEL-URL>` en `<OLLAMA-HOST>`.
2. **Secrets alleen via omgevingsvariabelen.** Nooit in code, docs of logregels. `.env`, `data/` en `*.db` nooit committen.
3. **Altijd JavaScript als ES modules.** Geen TypeScript, geen CommonJS, geen andere talen. In het panel alleen React + Vite met eigen CSS; geen UI-libraries of extra frameworks zonder toestemming.
4. **Alles per server gescheiden.** Elke query op vragen, sessies, punten, instellingen en koppelingen filtert op `guild_id`. In de API komt de server altijd uit `req.session.activeGuildId`, nooit uit de body of URL (behalve `POST /api/guild`, dat controleert of je toegang hebt). Nieuwe in-memory state (zoals beurten) krijgt ook een sleutel per server, en waar nodig per kanaal.
5. **Een nieuwe instelling komt op alle plekken tegelijk:** kolom met migratie in `src/database.js`, `dbGetInstellingen()`, `stmts.upsertInstellingen`, én elke aanroep daarvan (`PUT /api/instellingen`, `POST /api/reset-config`, `POST /api/categoriemappen/aanmaken`), `Instellingen.jsx`, `nl.js` + `en.js` en de tabel hierboven. `upsertInstellingen` gebruikt positionele parameters; een vergeten aanroep zet een instelling stil terug.
6. **Databasewijzigingen:** nieuwe tabellen met `CREATE TABLE IF NOT EXISTS`. Nieuwe kolommen via een migratiestap **na** het aanmaken van de tabel, nooit alleen in de `CREATE TABLE`, anders mist een bestaande installatie de kolom (zie `errorcodes/user_levels.md`). Controleer bij voorkeur met `PRAGMA table_info` en voer dan `ALTER TABLE` uit. De bestaande `try { ALTER TABLE } catch {}`-regels mogen blijven, maar vang dan alleen de fout "duplicate column" af.
7. **Bestaande spelersdata blijft staan.** Wijzigingen in punten, levels of achievements resetten nooit bestaande punten. Pas liever drempels of tiers aan en beschrijf in het plan wat er met bestaande spelers gebeurt.
8. **Rechten controleert de bot zelf.** `setDefaultMemberPermissions` bepaalt alleen wie een command ziet, en serverbeheerders kunnen dat aanpassen. Beheeracties (admin commands en knoppen als `verwijder_ja_<id>`) controleren daarom in de code op *Server beheren*. Nieuwe panel-routes altijd met `requireAuth` + `requireGuild`. Wat voor alle servers geldt (configuratie, servers) krijgt `requireSuperAdmin`.
9. **Een fout laat de bot nooit crashen.** Node stopt het proces bij een onafgevangen promise-fout. Elke event-handler, interactie, route en fire-and-forget-aanroep krijgt dus een `try/catch` of `.catch()` met een logregel. Beantwoord interacties altijd, ook bij een cooldown; bij werk dat langer duurt eerst `deferReply`/`deferUpdate`.
10. **Invoer van buiten is onbetrouwbaar.** Valideer slash-command-opties, panel-invoer en CSV-regels: verplichte velden, toegestane waarden (`type`, bekende categorieën), lengtes binnen de Discord-limieten (titel 256, beschrijving 4096, veldwaarde 1024, bericht 2000, inclusief de tekst eromheen) en Discord-ID's als 17–20 cijfers. Stuur berichten met invoer van spelers met beperkte `allowedMentions` (geen `@everyone`, `@here` of rollen).
11. **Categorie-instellingen van een server gaan voor.** Zonder koppeling mogen alle categorieën overal verschijnen, 18+ inbegrepen; dat is gewenst gedrag. Is een kanaal aan een categorie gekoppeld, dan toont nieuwe code daar alleen vragen uit die categorie, ook niet via een fallback, een opgegeven nummer of DM. De huidige code voldoet hier nog niet aan (zie backlog 🔞).
12. **Tweetalig panel.** Elke zichtbare tekst in het panel gaat via `t()` en staat in `nl.js` én `en.js` onder dezelfde sleutel. Geen hardcoded tekst in JSX. De berichten in Discord zijn nu Nederlands; zodra de bot tweetalig is, geldt dezelfde regel voor de bot.
13. **Punten en passief spel.** Het puntensysteem ontmoedigt rerollen en passen. Nieuwe acties die punten opleveren mogen niet te farmen zijn: geen punten voor herhaald klikken, aan/uit zetten of acties zonder echte deelname.

## Werkwijze
1. **Plan per versie:** een map `updateplannen/<versie>/` met `00-overzicht.md` (doel, scope, fases) en per fase een bestand, bijv. `01-bugs.md`, `02-beveiliging.md`. Elk fasebestand heeft een "Klaar als"-checklist.
2. **Aan het begin van een fase:** toon een kort bouwplan (welke bestanden, welke volgorde, eventuele keuzes of vragen) en **wacht op akkoord** voordat je begint.
3. **Bouw alleen de fase** die in het plan staat. Zie je iets buiten de scope, noteer het als suggestie in je samenvatting en in `BACKLOG.md`, maar bouw het niet.
4. **Nieuwe packages:** vraag eerst toestemming, met een korte reden. Gebruik waar het kan wat Node 22 zelf biedt (bijv. `node:test`, `node --env-file`, `crypto`, `fetch`).
5. **Keuzes die het plan openlaat:** kies de eenvoudigste variant die goed werkt en documenteer de keuze.
6. **Nieuwe Discord-rechten of intents:** vermeld ze in je samenvatting en in `README.md`, want Hendrie moet ze zelf aanzetten in de Developer Portal of op de server.
7. **Aan het eind van een fase:**
   - Werk de "Klaar als"-checklist af.
   - Bouw het panel (`cd admin && npm run build`) als er iets in `admin/` is veranderd, en controleer dat er geen fouten zijn.
   - Werk `VERSION` en `package.json` alleen bij in de laatste fase van een versie (semantic versioning: PATCH = fix, MINOR = feature, MAJOR = herstructurering). Een nieuwe `VERSION` op `main` start de build van het image.
   - Werk `README.md` bij bij inhoudelijke wijzigingen (functies, commands, instellingen, routes, rechten, omgevingsvariabelen, deployment).
   - Werk `BACKLOG.md` bij: vink meegenomen items af (ook dubbele items elders in de backlog), voeg nieuwe items toe, en haal een focus-release weg zodra al zijn items zijn uitgebracht.
   - Werk dit bestand bij als structuur, tabellen, instellingen, commands, knoppen, routes of omgevingsvariabelen veranderen.
   - Maak **één commit** met de boodschap `v<versie> — <korte omschrijving>`, bijv. `v1.9.3 — configuratie alleen voor superadmins`, en **push** naar GitHub. Commits van tussenliggende fases heten `v<versie> (fase N/M) — <omschrijving>`.
   - Geef een **samenvatting**: wat er is gebouwd, hoe Hendrie het test (concrete stappen in Discord en het panel), en wat openstaat of is afgeweken van het plan.
8. **Het image wordt gebouwd door GitHub Actions** (`.github/workflows/docker.yml`) zodra een nieuwe `VERSION` op `main` staat. Controleer na de push onder Actions of de workflow groen is en meld het resultaat in de samenvatting. `build-and-push.sh` is alleen een noodoptie als Actions niet werkt, en dan pas als alles gecommit en gepusht is.

## Commando's
Vul deze aan zodra er nieuwe bijkomen.
```bash
npm ci                          # dependencies bot (volgens package-lock.json)
cd admin && npm ci              # dependencies panel (volgens admin/package-lock.json)
npm install <package>           # alleen bij toevoegen/bijwerken van een package; lock file meecommitten
cd admin && npm run build       # panel bouwen naar admin/dist (niet in git; nodig vóór node index.js)
node index.js                   # lokaal starten (leest .env via dotenv; database in ./data; vereist gebouwd panel)
cd admin && npm run dev         # panel lokaal op de Vite-devserver, /api en /auth gaan naar poort 3001
gh run list --workflow docker.yml   # status van de image-builds (als gh beschikbaar is)
./build-and-push.sh             # noodoptie: image bouwen en pushen naar GHCR (tag uit VERSION + latest)
```

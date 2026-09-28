# Backlog — WoD Bot

> Bijgehouden in volgorde van prioriteit per categorie.
> Status: `[ ]` open · `[x]` klaar · `[~]` in progress
> Omvang: `S` klein (< 1 uur) · `M` middel (een avond) · `L` groot (meerdere sessies)
> ⚠️ = beveiligings- of stabiliteitsprobleem, voorrang
> 💡 = idee, richting nog niet gekozen; eerst brainstormen

---

## ✅ Uitgebracht vóór v1.7.0

- [x] Spel met `/wod`, `/waarheid`, `/doen`; knoppen Waarheid, Doen, Verrassing, Reroll, Passen (strafvraag), Nieuwe ronde
- [x] Beurtrotatie met `/beurt`
- [x] "Nooit heb ik…" met `/nooit` en stemknoppen
- [x] Fun-tests `/liefdestaal`, `/persoonlijkheid`, `/relatietest`
- [x] Beheer met `/voeg-toe`, `/verwijder`, `/lijst`, `/reload`, `/reset`, `/sessie`
- [x] Meerdere servers, vragen en instellingen per server in SQLite, automatische migratie van `vragen.json` en `settings.json`
- [x] Meerdere sessies per server (per kanaal), pauzeren en hervatten
- [x] Categorieën (algemeen, vrienden, koppels, feest, 18+), DM-modus per vraag en per server, cooldown
- [x] Admin panel (React) met Discord OAuth2: vragen, CSV-import en -export, statistieken, sessies, instellingen

## ✅ Uitgebracht in v1.7.0 — Refactor en profielen

- [x] `index.js` opgesplitst in `src/` met een command loader
- [x] `settings.json` opgeheven, `config.json` is de enige configuratie
- [x] Tabellen `user_levels` en `user_achievements`; punten, levels en achievements
- [x] `/profiel`, `/ranglijst`, `/achievements`
- [x] Pagina Ranglijst in het panel

## ✅ Uitgebracht t/m v1.9.2 — versie onbekend

Staat in de code, maar de versie per item is niet meer bekend.
- [x] Pagina Servers voor superadmins (`SUPERADMIN_IDS`): alle servers zien, overschakelen, bot laten vertrekken
- [x] Panel tweetalig (NL/EN) met taalknop
- [x] Categorie per kanaal en knop "Categoriemappen aanmaken"
- [x] Pagina Nooit met eigen stellingen per server

## ✅ Uitgebracht in v1.9.0 — Levels en puntenbalans

- [x] Punten aangepast om passief spel te ontmoedigen: Reroll −5, Passen −7, Nieuwe ronde +5
- [x] 8 levels (Lafaard → Legenda) in plaats van 4, bestaande punten behouden
- [x] Level-up melding in het kanaal

## ✅ Uitgebracht in v1.9.2 — Duplicaatcontrole

- [x] UNIQUE-index op `(guild_id, LOWER(tekst))`, bestaande duplicaten opgeruimd
- [x] `/voeg-toe` meldt een dubbele vraag; CSV-import toont toegevoegd en overgeslagen

## ✅ Uitgebracht in v1.9.3 — Veiligheid & stabiliteit

- [x] Fout in een command of knop geeft een nette melding in plaats van een crash; globale fout-handlers
- [x] Level-up melding via "Nieuwe ronde" en `/nooit` werkt weer
- [x] Cooldown geeft een melding en geldt per server
- [x] `allowedMentions: { parse: [] }` op de client
- [x] Verplichte omgevingsvariabelen bij het starten; `SESSION_SECRET` minimaal 32 tekens, geen fallback
- [x] `/api/config` en de pagina Configuratie alleen voor superadmins, met URL-validatie
- [x] Sessie-cookie `wod.sid` (HttpOnly, Lax, Secure achter HTTPS), OAuth `state`, nieuwe sessie-ID na inloggen
- [x] Security headers, `x-powered-by` uit, `cors` verwijderd
- [x] Admin commands, `verwijder_ja_<id>` en `/beurt verwijder|reset` controleren zelf op *Server beheren*
- [x] Panel controleert rechten opnieuw (cache 60 s); kanaal bij categorie-koppeling gevalideerd

---

## 🎯 Mogelijke focus-releases

Suggesties om items te bundelen. Vrij te husselen.

- **Standaard doorvoeren (patch):** `build-and-push.sh` met controles, `config.json` als volume
- **Categorieën per kanaal 2.0:** alles uit 🔞
- **Punten eerlijk:** farmen onmogelijk, alleen de speler aan de beurt, achievements rechtgezet, levelnamen in het panel
- **Timeout & beurten:** timeout, `/rejoin`, beurt overnemen, DM-melding bij uitvallen
- **AI-vraaggenerator:** Anthropic of Ollama met review-stap
- **Tweetalige bot:** Engelse berichten en vragen per server

---

## 🐛 Bugs & opschoning

- [x] `S` ⚠️ **Level-up melding via knoppen werkt niet**
  `stuurLevelUpNotificatie()` in `src/buttons.js` gebruikt `embeds`, maar dat is in dat bestand niet geïmporteerd (alleen als parameter van `handleButton`). De `ReferenceError` wordt afgevangen en gelogd. Bij "Nieuwe ronde" en stemmen bij `/nooit` verschijnt dus nooit een level-up. `embeds` importeren of meegeven.

- [x] `S` ⚠️ **Een fout in een command of knop laat de bot crashen**
  `interactionCreate` heeft geen `try/catch`, en er zijn geen globale handlers voor `unhandledRejection`, `uncaughtException` en `client.on('error')`. Eén mislukte `interaction.message.delete()` of `kanaal.send()` (bijv. geen rechten) stopt het hele proces. Handlers in `try/catch` met een nette ephemeral foutmelding, plus globale handlers die loggen.

- [x] `S` **Cooldown laat de interactie hangen**
  Bij een cooldown doet `handleButton` niets, dus Discord toont "Deze interactie is mislukt". Een korte ephemeral melding of `deferUpdate()`. Daarnaast geldt de cooldown nu per gebruiker over alle servers heen; sleutel `guildId:userId`.

- [ ] `S` **Achievements kloppen niet meer met de levels**
  Sinds v1.9.0 zijn er 8 levels, maar `checkAchievements()` kent "Durfal" toe bij level 2 (nu Deelnemer) en "Legenda" bij level 4 (nu Avonturier). "Onthullingsmaster" (level 3) staat in `/achievements` maar wordt nooit toegekend. "Op dreef" zegt "3 rondes op één avond" maar telt alle rondes ooit. Achievements rechtzetten, zonder behaalde achievements af te pakken.

- [ ] `S` **Achievements op twee plekken gedefinieerd**
  De voorwaarden staan in `src/game.js`, de lijst met emoji en beschrijving in `src/embeds.js` en nog een emoji-lijst in `src/buttons.js`. Eén definitie in `game.js` waar de rest uit leest.

- [ ] `S` **Panel toont oude levelnamen op de ranglijst**
  `ranglijst.levelNamen` in `nl.js` en `en.js` heeft nog de 4 levels van vóór v1.9.0. Level 5 en hoger krijgen geen naam, en level 2 t/m 4 een verkeerde (Lv.4 toont "Legenda" in plaats van "Avonturier"). Discord klopt wel, omdat de bot `LEVELS` uit `src/game.js` gebruikt. `GET /api/ranglijst` rekent het level uit met `getLevelInfo(punten)` en stuurt het levelnummer mee. De lijst in beide vertaalbestanden krijgt alle 8 levels. EN: Coward, Participant, Daredevil, Adventurer, Revelation, Seducer, Champion, Legend.

- [ ] `S` **Migratie van `user_levels` in de verkeerde volgorde**
  De `ALTER TABLE user_levels`-regels staan vóór de `CREATE TABLE user_levels` (oorzaak van `errorcodes/user_levels.md`). Werkt nu toevallig, maar alle migraties horen na het aanmaken van de tabellen, met `PRAGMA table_info` in plaats van een lege `catch`.

- [ ] `S` **Duplicaten opruimen bij elke start**
  De `DELETE … NOT IN (SELECT MIN(id) …)` uit v1.9.2 draait bij elke start. Door de UNIQUE-index is dat overbodig; eenmalig maken (bijv. alleen als de index nog niet bestaat).

- [ ] `S` **Standaardcategorie is niet eenduidig**
  De database en CSV-import gebruiken `18+` als standaard, `/voeg-toe` gebruikt `algemeen`. Eén standaard kiezen (bij voorkeur `algemeen`), en `/voeg-toe` een optie `categorie` geven met de vaste lijst.

- [ ] `S` **Categorie niet gevalideerd**
  Panel, API en CSV accepteren elke tekst als categorie. De vaste lijst (algemeen, vrienden, koppels, feest, 18+) op één plek in de code, en de API en import controleren daarop.

- [ ] `S` **Lange vragen breken de embed**
  Vragen en stellingen hebben geen maximale lengte. Een lange tekst plus de tekst eromheen gaat over de 4096 tekens van een embed-beschrijving, en een lange naam over de 1024 van een veld (uitslag `/nooit`). Maximale lengte instellen bij invoer (command, panel, CSV) en veilig afkappen bij tonen.

- [ ] `S` **Beurtrotatie per server in plaats van per sessie**
  `beurtenMap` gebruikt alleen `guildId`. Met meerdere sessies in verschillende kanalen delen die één rotatie. Sleutel per kanaal of per sessie, en opslaan in de database (nu weg na een herstart).

- [ ] `S` **`ephemeral: true` is verouderd**
  Vervangen door `flags: MessageFlags.Ephemeral` (discord.js 14.x geeft een waarschuwing).

- [ ] `S` **Veel dubbele code in knoppen en commands**
  De afhandeling van waarheid/doen (vraag kiezen, teller ophogen, DM of kanaal, knoppen) staat bijna gelijk op tien plekken in `buttons.js`, `waarheid.js` en `doen.js`. Eén functie `stuurVraag(interaction, type, opties)`. Maakt de 18+- en punten-fixes veel kleiner.

- [ ] `S` **Oude teksten**
  ~~In `configuratie.meerServersText2` (NL en EN) staat nog "Vragen zijn gedeeld tussen alle servers"~~ (opgelost in v1.9.3). `/reset` zegt "statistieken" te resetten, maar beëindigt alleen de sessie. README-kop noemde v1.9.0.

- [ ] `S` **Foutdetails naar het panel**
  `categoriemappen/aanmaken` en `servers/:guildId` sturen `err.message` terug naar de browser. Vaste foutcode met een tekst uit `nl.js`/`en.js`, details alleen in de log.

- [ ] `S` **Categoriemappen worden dubbel aangemaakt**
  Elke klik op "Categoriemappen aanmaken" maakt een nieuwe categorie "🎮 Waarheid of Doen" met nieuwe kanalen. Eerst controleren wat er al bestaat en alleen ontbrekende kanalen aanmaken.

- [ ] `S` **`/relatietest` pingt de uitgedaagde speler niet**
  De mention `<@id>` staat in de embed-beschrijving, en daar pingt Discord nooit. Voor een echte melding: de mention in `content` zetten met `allowedMentions: { users: [targetUser.id] }` (de client staat sinds v1.9.3 op `parse: []`).

---

## 🔐 Beveiliging

- [x] `S` ⚠️ **Elke server-admin kan de loginconfiguratie van de hele bot wijzigen**
  `PUT /api/config` heeft alleen `requireAuth`. Iedereen met *Server beheren* op een willekeurige server met de bot kan `redirectUri` en `frontendUrl` aanpassen. Daarmee breekt de login voor iedereen, of gaat de OAuth-code naar een ander adres. `requireSuperAdmin` op `GET` en `PUT /api/config`, en de pagina Configuratie alleen tonen aan superadmins.

- [x] `S` ⚠️ **`SESSION_SECRET` verplicht maken**
  Valt terug op een vaste tekst in de code. Daarmee kan iemand een sessie-cookie vervalsen en als superadmin inloggen. Zonder secret (of korter dan 32 tekens) niet starten, net als bij de Hendriebuilds-bot.

- [x] `S` ⚠️ **Verwijderknop controleert geen rechten**
  `verwijder_ja_<id>` verwijdert een vraag zonder te controleren wie klikt. Het bericht is ephemeral, maar de custom ID is voorspelbaar en `/verwijder` is alleen afgeschermd via `setDefaultMemberPermissions`, wat serverbeheerders kunnen aanpassen. In de knop én in alle admin commands controleren op *Server beheren*.

- [x] `S` **Verplichte omgevingsvariabelen controleren bij het starten**
  `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`. Ontbreekt er één, dan een duidelijke logregel en stoppen met exitcode 1.

- [x] `S` **OAuth `state`-parameter**
  De login stuurt geen `state` mee, dus login-CSRF is mogelijk. Willekeurige `state` in de sessie zetten en bij de callback vergelijken.

- [x] `S` **Rechten alleen bij het inloggen gecontroleerd**
  De lijst met servers komt uit de login en blijft 24 uur geldig. Wie *Server beheren* kwijtraakt of uit de server wordt gezet, kan het panel voor die server blijven gebruiken. Bij `requireGuild` (kort gecachet, bijv. 1 minuut) opnieuw controleren of de gebruiker nog lid is met de juiste rechten.

- [x] `S` **Sessie-cookie instellen**
  `secure: false` en geen `sameSite`. Instellen: `httpOnly`, `sameSite: 'lax'`, `secure: true` achter HTTPS met `app.set('trust proxy', 1)`, en een `maxAge`.

- [ ] `M` **CSRF-bescherming op de API**
  `POST /api/vragen/import` accepteert elk content-type (`express.text({ type: '*/*' })`), dus een formulier op een andere site kan vragen importeren. Alle schrijvende routes alleen met `Content-Type: application/json` (import als JSON of met een eigen header, bijv. `X-Requested-With`), en de `Origin` controleren tegen `frontendUrl`.

- [ ] `M` **Sessies niet in het geheugen**
  `express-session` gebruikt de MemoryStore: iedereen is uitgelogd na een herstart en het lekt geheugen. Eigen kleine store in SQLite, of een package na toestemming.

- [x] `S` **Security headers op het panel**
  `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `X-Robots-Tag: noindex`. Met een paar regels middleware, geen package.

- [x] `S` **`cors` kan weg**
  Panel en API draaien op hetzelfde adres, dus CORS is niet nodig. `cors` met `credentials: true` verwijderen verkleint het risico (en scheelt een package).

- [x] `S` **Kanaal bij categorie-koppeling niet gecontroleerd**
  `POST /api/channel-categorie` slaat elk `channelId` op. Controleren dat het een tekstkanaal van de actieve server is.

- [x] `S` **`allowedMentions` beperken**
  Bij berichten met tekst van spelers (stellingen van `/nooit`, namen, vragen) `allowedMentions: { parse: [] }`, zodat er nooit iemand gepingd wordt.

- [ ] `M` **Auditlog van beheeracties**
  Wie wat wanneer deed via panel of commands (vraag verwijderd, import, instellingen, sessie beëindigd, server verlaten). Zichtbaar in het panel.

- [ ] `S` **Dependencies controleren**
  `npm audit` in de root en in `admin/`, versies bijwerken, eventueel Dependabot.

---

## 🔞 18+ en categorieën

> Uitgangspunt: zonder koppeling mogen alle categorieën (ook 18+) overal verschijnen. Dat is gewenst. Aparte kanalen zijn een keuze per server, geen verplichting.

- [ ] `S` **Gekoppeld kanaal toont soms andere categorieën**
  Heeft een gekoppeld kanaal geen vragen (meer) in zijn categorie, dan valt `getVraag()` terug op álle vragen. In een "vrienden"-kanaal kan dan een 18+-vraag verschijnen. `/waarheid nummer:` en `/doen nummer:` negeren de koppeling helemaal. Geen fallback naar andere categorieën maar een melding "geen vragen in deze categorie", en nummers alleen binnen de categorie van het kanaal.

- [ ] `S` 💡 **Optie: 18+ alleen in eigen kanalen**
  Optionele instelling per server voor servers die wél een apart 18+-kanaal willen: 18+ alleen in kanalen die aan `18+` gekoppeld zijn (of als NSFW zijn gemarkeerd in Discord), alle andere categorieën overal. Standaard uit, zodat servers die alles door elkaar spelen niets merken. Ook bepalen wat er gebeurt in DM-modus.

- [ ] `M` **Meerdere categorieën per kanaal**
  Nu één categorie per kanaal. Een kanaal "feest + vrienden" of "alles behalve 18+" is logischer. Koppeltabel met meerdere categorieën, of een lijst met toegestane categorieën per kanaal.

- [ ] `S` **Categorie zichtbaar in de embed**
  De categorie (bijv. een 🔞-label bij 18+) in de footer of titel, zodat duidelijk is wat voor vraag het is.

- [ ] `M` **Leeftijdsverificatie-rol 18+**
  Instelbare rol per server; alleen spelers met die rol krijgen 18+-vragen of mogen in 18+-kanalen spelen.

- [ ] `M` **Opt-out per categorie**
  Spelers kunnen zelf categorieën uitzetten (bijv. geen koppels-vragen); de bot kiest dan een vraag uit hun toegestane categorieën.

---

## 👤 Punten, profielen & achievements

- [ ] `S` ⚠️ **Punten farmen bij `/nooit`**
  Stem aan, stem uit, stem weer aan: elke keer +3. Bijhouden wie al punten heeft gekregen voor die stemming.

- [ ] `M` **Alleen de speler aan de beurt mag klikken**
  Iedereen kan op Waarheid/Doen, Reroll, Passen en Nieuwe ronde klikken, en de punten gaan naar wie klikt. Spam op Nieuwe ronde en `/wod` levert telkens +5 op. De speler aan de beurt (of die bij `/wod` gekozen is) opslaan bij het bericht en andere klikkers een ephemeral melding geven. Punten voor `/wod` pas geven als de ronde echt gespeeld is.

- [ ] `M` **`/strafpunten`**
  Command waarmee een admin (of de groep) punten aftrekt als straf. Eerder besproken maar niet vastgelegd: wie het mag gebruiken, syntax (`/strafpunten speler aantal reden`), of de reden verplicht is, en of punten onder 0 mogen (nu nooit).

- [ ] `S` **Relatietest niet te farmen**
  +15 voor beide spelers, zo vaak als je wilt. Beperken tot bijv. één keer per paar per dag.

- [ ] `S` **Ranglijst langer dan top 10**
  Paginering of `/ranglijst pagina`, en de eigen positie tonen als je niet in de top 10 staat.

- [ ] `S` **Punten beheren in het panel**
  Punten van een speler corrigeren of resetten, met bevestiging (en in het auditlog).

- [ ] `M` 💡 **Meer achievements**
  Bijv. 10x strafvraag uitgevoerd, 50 rondes, alle categorieën gespeeld, eerste 18+-vraag, nachtbraker. Eerst de bestaande rechtzetten (zie 🐛).

---

## ⏱️ Sessies, beurten & timeout

- [ ] `L` **Timeout-mechanisme**
  Eerder uitgewerkt, niet gebouwd: als een speler binnen X minuten niet reageert, gaat de beurt door. Timers opgeslagen in SQLite (`turn_started_at`), zodat ze een herstart overleven. Timeout per server instelbaar in het panel.

- [ ] `S` **DM-melding bij uitvallen**
  Onderdeel van de timeout: de speler krijgt een DM dat de beurt is overgeslagen, met de optie terug te komen.

- [ ] `S` **`/rejoin`**
  Na een timeout jezelf weer in de rotatie zetten.

- [ ] `S` **Beurt overnemen**
  Knop waarmee een andere speler de beurt overneemt (bijv. als de speler aan de beurt even weg is).

- [x] `S` **Beurtrotatie beheren alleen voor spelers of admins**
  Nu kan iedereen `/beurt reset` of `/beurt verwijder` doen. Bepalen wie dat mag.

- [ ] `M` **Sessie-export**
  Overzicht van een sessie (gespeelde vragen, wie wat deed, punten) als bericht of bestand, via Discord of het panel.

- [ ] `M` 💡 **Sessiethema's**
  Een sessie starten met een thema (bijv. alleen feest, alleen koppels) dat de categorieën voor die sessie bepaalt.

- [ ] `S` **Oude sessies opruimen**
  Beëindigde sessies blijven voor altijd staan. Na X dagen verwijderen of archiveren.

---

## 🎮 Spelmodi & vragen

- [ ] `L` **AI-vraaggenerator in het panel**
  Nieuwe vragen laten genereren met de Anthropic API of een lokaal Ollama-model (`<OLLAMA-HOST>`). Instelbare provider, model en prompt, opgeslagen in de configuratie (API-key alleen als omgevingsvariabele). Altijd een review-stap: gegenereerde vragen eerst bekijken, bewerken of afwijzen voordat ze in de database komen, met de gewone duplicaatcontrole. Keuze van type, categorie en aantal.

- [ ] `S` **Rapporteer een vraag**
  Knop bij een vraag waarmee spelers melden dat die niet oké of kapot is. Meldingen zichtbaar in het panel, met de optie de vraag te verbergen of te verwijderen.

- [ ] `M` **Vraag van de dag**
  Elke dag op een vast tijdstip een vraag in een ingesteld kanaal. Kanaal, tijd en categorie per server instelbaar.

- [ ] `M` 💡 **Hot Takes**
  Spelmodus met een stelling waar spelers eens/oneens op stemmen, met een uitslag.

- [ ] `M` 💡 **Spectrum**
  Spelmodus waarin spelers zichzelf op een schaal plaatsen (bijv. "hoe jaloers ben jij, 1–10"), met een uitslag.

- [ ] `S` 💡 **AI-vervolgvragen**
  Na een waarheid een vervolgvraag laten voorstellen door de AI. Hangt af van de AI-vraaggenerator.

- [ ] `S` **Vragen verbergen in plaats van verwijderen**
  Een vraag tijdelijk uitzetten zonder hem kwijt te raken.

- [ ] `S` **Nooit-stellingen importeren en exporteren**
  CSV, net als bij de vragen, met duplicaatcontrole.

---

## 🌍 Tweetaligheid

- [ ] `L` **Bot in het Nederlands en Engels**
  Het panel is al tweetalig, de berichten in Discord nog niet. Taal per server instelbaar (standaard Nederlands). Alle teksten in `embeds.js`, `buttons.js` en de commands naar vertaalbestanden, net als `admin/src/i18n/`. Slash commands met `setNameLocalizations`/`setDescriptionLocalizations`.

- [ ] `M` **Vragen per taal**
  Vragen, stellingen en de fun-tests hebben een taal, zodat een Engelse server Engelse vragen krijgt. Hangt samen met de taalinstelling per server.

- [ ] `S` **Taal van het panel volgen**
  Bij de eerste keer de taal van de browser of van Discord (`locale` uit OAuth) gebruiken in plaats van altijd Nederlands.

---

## 🖥️ Admin panel

- [x] `S` **Configuratie alleen voor superadmins**
  Zie ⚠️ in 🔐. De pagina ook uit de navigatie halen voor gewone admins. (Uitgebracht in v1.9.3)

- [ ] `M` **Panel responsive maken**
  Navigatie en tabellen bruikbaar op mobiel.

- [ ] `S` **Zoeken en filteren bij vragen**
  Op tekst, categorie en DM-modus. Met honderden vragen wordt de lijst onoverzichtelijk.

- [ ] `S` **Bevestiging bij verwijderen en beëindigen**
  Voor vraag verwijderen, sessie beëindigen, reset en "configuratie resetten", waar dat nog niet zo is.

- [ ] `M` **Statuspagina**
  Bot online, versie, aantal servers, en per server een controle op ontbrekende rechten (Send Messages, Embed Links, Manage Channels voor categoriemappen).

- [ ] `S` **Versie in het panel**
  Versienummer uit `VERSION` in de zijbalk of footer.

---

## ⚙️ Technisch & Infra

- [ ] `S` **`build-and-push.sh` volgens de standaard**
  Sinds v1.10.0 (fase 1) een noodoptie die de versie uit `VERSION` leest en stopt als `VERSION` en `package.json` verschillen. Nog open: stoppen (met een melding) als de repo niet schoon is of er ongepushte commits zijn. Zoals `build-push.sh` van de Hendriebuilds-bot.

- [x] `S` **`.dockerignore` aanvullen** (v1.10.0)
  Het bestand heette al `.dockerignore`; aangevuld met `.git`, `.github`, `.env*`, `data`, `*.db*`, `updateplannen` en `errorcodes`.

- [x] `S` **`admin/node_modules` en `admin/dist` uit git** (v1.10.0)
  Beide staan in `.gitignore` maar zijn toch gecommit (`git rm -r --cached`). Het image bouwt het panel zelf.

- [x] `S` **`package-lock.json` wél committen** (v1.10.0)
  Beide lock files staan in `.gitignore`. Zonder lock file installeert de Docker-build telkens andere versies. Lock files committen en in de Dockerfile `npm ci` gebruiken.

- [ ] `S` **`config.json` buiten het image**
  `config.json` staat in de repo (met het echte domein) en wordt in het image gekopieerd. Wijzigingen via het panel verdwijnen bij een nieuw image. Verplaatsen naar `DATA_DIR`, in de repo alleen een `config.example.json` met placeholders.

- [ ] `S` **`.env.example` en lokaal starten**
  Voorbeeldbestand zonder echte waarden, en een script `"dev": "node --env-file=.env index.js"`. Daarna kan `dotenv` eventueel weg.

- [ ] `S` **Volume en `DATA_DIR` in de Dockerfile**
  `ENV DATA_DIR=/data` en `VOLUME /data`, zodat de database niet per ongeluk in de container blijft.

- [ ] `S` **Healthcheck in de Dockerfile**
  Op basis van een `GET /health` zonder login.

- [ ] `S` **Container als non-root gebruiker**
  UID 99 / GID 100 (Unraid `nobody:users`), rechten op de datamap goed zetten.

- [ ] `S` **Kleiner image**
  `python3 make g++` zijn alleen nodig om better-sqlite3 te bouwen. In een aparte build-stage installeren en alleen `node_modules` meenemen.

- [ ] `S` **Nette afsluiting**
  Bij `SIGTERM` alle sessie-caches opslaan, de database sluiten en `client.destroy()` aanroepen.

- [ ] `S` **Slash commands niet bij elke start registreren**
  Nu bij elke start globaal registreren én de guild commands van elke server leegmaken (één API-call per server). Alleen als de definitie is veranderd (hash opslaan), of via een apart script.

- [ ] `S` **Logging**
  Logregels met tijdstempel en onderdeel (`[game]`, `[panel]`), naar stdout voor de Unraid-logs.

- [ ] `M` **Tests met `node:test`**
  Geen extra package nodig. Eerst `getVraag()` (categorieën, 18+), `voegPuntenToe()`/`checkAchievements()`, CSV-import en de toegangsregels van de API.

- [x] `M` **GitHub Actions** (v1.10.0)
  `.github/workflows/docker.yml`: controle bij elke push en PR, image bouwen en pushen bij een nieuwe `VERSION` op `main`. `build-and-push.sh` is nu een noodoptie. Echte tests (`node:test`) komen er later bij.

- [ ] `S` **Actions bijwerken naar Node 24**
  GitHub waarschuwt dat `actions/checkout@v4` en `actions/setup-node@v4` op het verouderde Node 20 draaien (nu nog geforceerd naar Node 24). Overstappen op `@v5`, en de andere `docker/*`-actions controleren op nieuwere versies. `ubuntu-latest` gaat vanaf 19 oktober 2026 naar Ubuntu 26; waarschijnlijk geen gevolgen, wel even controleren.

- [ ] `S` **GitHub Release bij een nieuwe versie**
  De workflow maakt nu alleen de git-tag `v<versie>` (en daarmee de automatische broncode-zip onder *Tags*). Een echte GitHub Release met de wijzigingen uit het plan of de commit maakt de versiegeschiedenis leesbaarder. Kan met `gh release create` in de job `release`.

- [ ] `M` **Database-back-ups**
  Automatisch met `db.backup()` van better-sqlite3 naar een map in het volume, met een maximum aantal kopieën.

- [ ] `S` **CHANGELOG.md**
  In Keep a Changelog-formaat, beginnend bij de ✅-secties hierboven.

- [ ] `M` **`database.js` en `buttons.js` opsplitsen**
  Beide worden groot. Per onderdeel (`db/vragen.js`, `db/levels.js`, `buttons/spel.js`, `buttons/fun.js`, …) met één gedeelde verbinding.

---

## 🌐 Toekomst / Ambitieus

- [ ] `L` 💡 **Publieke bot**
  De bot openstellen voor andere servers: onboarding bij binnenkomst, standaardvragen per taal, limieten en moderatie van eigen vragen.

- [ ] `M` 💡 **Vragenpakketten**
  Kant-en-klare sets (feest, koppels, 18+) die een server met één klik kan importeren.

- [ ] `M` 💡 **Statistieken per speler**
  Hoe vaak waarheid of doen gekozen, favoriete categorie, meest gepast. In `/profiel` en het panel.

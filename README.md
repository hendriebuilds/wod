# WoD Bot — Waarheid of Doen

Discord-bot voor Waarheid of Doen, met profielen, levels en achievements, en een admin panel om alles per server te beheren.

- **Spel:** `/wod` met knoppen Waarheid, Doen en Verrassing, plus Reroll, Passen (strafvraag) en Nieuwe ronde. Of direct een vraag met `/waarheid` en `/doen`
- **Beurtrotatie:** spelers toevoegen en de beurt laten doorschuiven met `/beurt`
- **Sessies:** meerdere sessies per server, per kanaal. Vragen komen per sessie niet dubbel voorbij; pauzeren, hervatten en wisselen met `/sessie`
- **Nooit heb ik…:** stemmen met knoppen, met eigen stellingen per server
- **Profielen:** punten, 8 levels, achievements en een ranglijst per server
- **Fun:** liefdestaaltest, persoonlijkheidstest en relatietest met een andere speler
- **Vragen:** categorieën (algemeen, vrienden, koppels, feest, 18+), categorie per kanaal, DM-modus, duplicaatcontrole, CSV-import en -export
- **Admin panel:** Discord-login, beheer per server, Nederlands en Engels

Stack: Node.js 22, discord.js v14, Express, SQLite (better-sqlite3), React + Vite.

---

## Discord-applicatie instellen

In de [Discord Developer Portal](https://discord.com/developers/applications):

1. **Bot:** maak een bot aan en kopieer het token (`DISCORD_TOKEN`). Privileged intents zijn niet nodig.
2. **OAuth2:** kopieer de Client ID en Client Secret (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`) en voeg deze redirect toe: `<PANEL-URL>/auth/callback`.
3. **Uitnodigen:** voeg de bot toe met de scopes `bot` en `applications.commands` en minimaal deze rechten:
   View Channels, Send Messages, Embed Links, Read Message History.
   Wil je de knop "Categoriemappen aanmaken" in het panel gebruiken, geef dan ook Manage Channels.

De slash commands worden bij elke start globaal geregistreerd. Na een eerste installatie kan het even duren voordat ze overal zichtbaar zijn.

---

## Installatie (Docker)

Het image staat op `ghcr.io/hendriebuilds/wod`.

```yaml
wod:
  image: ghcr.io/hendriebuilds/wod:latest
  restart: unless-stopped
  env_file: .env
  ports:
    - "3001:3001"
  volumes:
    - wod_data:/app/data
```

Zet het panel achter een reverse proxy met HTTPS en vul die URL in als `<PANEL-URL>`.

- **HTTPS en `X-Forwarded-Proto`:** begint `frontendUrl` met `https://`, dan is de sessie-cookie `Secure`. De reverse proxy moet dan de header `X-Forwarded-Proto` meesturen; zonder die header lukt het inloggen niet (je belandt steeds weer op het loginscherm). Of de cookie `Secure` is, wordt bij het starten bepaald: na het wijzigen van `frontendUrl` de container herstarten.
- **Restart policy:** gebruik `unless-stopped` of `always`. Bij een onverwachte fout (`uncaughtException`) stopt de bot bewust, zodat Docker hem schoon herstart.
- **Startcontrole:** de bot start niet als een verplichte variabele ontbreekt of `SESSION_SECRET` korter is dan 32 tekens. De log noemt welke variabele het is.

### Omgevingsvariabelen

| Variabele | Beschrijving | Standaard |
|---|---|---|
| `DISCORD_TOKEN` | Bot token | vereist |
| `DISCORD_CLIENT_ID` | OAuth2 client ID (Application ID) | vereist |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret | vereist |
| `SESSION_SECRET` | Willekeurige string voor sessies, **minimaal 32 tekens** | vereist |
| `SUPERADMIN_IDS` | Discord user-ID's met toegang tot alle servers, kommagescheiden | leeg |
| `ADMIN_PORT` | Poort van panel en API | `3001` |
| `DATA_DIR` | Map voor de database `bot.db` | `/app/data` in de container |

Een willekeurig secret maken: `openssl rand -hex 32`

### Configuratie van het panel

In `config.json` of via het panel onder **Configuratie**:

```json
{
  "redirectUri": "<PANEL-URL>/auth/callback",
  "frontendUrl": "<PANEL-URL>"
}
```

`redirectUri` moet precies gelijk zijn aan de redirect in de Developer Portal, anders geeft Discord "Invalid redirect_uri".

Let op: `config.json` zit in het image. Wijzigingen via het panel gaan verloren bij een nieuw image, tenzij je het bestand als volume mount (staat in de backlog).

### Back-up

Alle vragen, sessies, punten en instellingen staan in `bot.db` in het volume:

```bash
docker stop wod
docker cp wod:/app/data/bot.db ./wod-$(date +%F).db
docker start wod
```

---

## Eerste keer instellen

1. Start de container en nodig de bot uit op je server.
2. Log in op het panel via `<PANEL-URL>`. Je ziet de servers waar de bot in zit en waar jij **Server beheren** hebt. Superadmins zien alle servers.
3. Voeg vragen toe onder **Vragen** (los of via CSV-import) en eventueel eigen stellingen onder **Nooit**.
4. Kies onder **Instellingen** de cooldown en de DM-modus. Wil je categorieën per kanaal, dan kun je kanalen koppelen of automatisch categoriemappen laten aanmaken.
5. Start een spel in Discord met `/wod`.

### Categorieën en 18+

Elke vraag heeft een categorie: `algemeen`, `vrienden`, `koppels`, `feest` of `18+`. Met **Categorieën per chat** (Instellingen) koppel je een kanaal aan één categorie. In dat kanaal verschijnen dan alleen vragen uit die categorie.

Zonder koppeling komen alle categorieën door elkaar in elk kanaal, 18+ inbegrepen. Wil je 18+ apart houden, koppel dan een eigen kanaal aan `18+` en de andere kanalen aan de overige categorieën.

### CSV-import

Kolommen `type` (`waarheid` of `doen`) en `tekst` zijn verplicht, `categorie` is optioneel (standaard `18+`). Dubbele vragen (hoofdletters maken niet uit) worden overgeslagen; na de import zie je hoeveel er zijn toegevoegd en overgeslagen.

```csv
type,tekst,categorie
waarheid,"Wat is je grootste guilty pleasure?",vrienden
doen,"Doe je beste imitatie van iemand in dit kanaal",feest
```

---

## Slash commands

### Spel
| Command | Beschrijving |
|---|---|
| `/wod [speler]` | Start een ronde; optioneel gericht op een speler |
| `/waarheid [nummer]` | Direct een waarheidsvraag, of een specifieke via het nummer uit `/lijst` |
| `/doen [nummer]` | Direct een doe-opdracht, of een specifieke via het nummer |
| `/beurt toevoegen\|lijst\|volgende` | Beurtrotatie: speler toevoegen, lijst bekijken, naar de volgende speler |
| `/beurt verwijder\|reset` | Speler uit de rotatie halen of de rotatie wissen (alleen met Server beheren) |
| `/nooit [stelling]` | Ronde "Nooit heb ik…"; zonder stelling kiest de bot er een |
| `/statistieken` | Statistieken van de sessie in dit kanaal |

### Profielen
| Command | Beschrijving |
|---|---|
| `/profiel [speler]` | Profiel met level, punten en achievements |
| `/ranglijst` | Top 10 van deze server |
| `/achievements` | Jouw achievements |

### Fun
| Command | Beschrijving |
|---|---|
| `/liefdestaal` | Liefdestaaltest (10 vragen) |
| `/persoonlijkheid` | Persoonlijkheidstest (9 vragen) |
| `/relatietest speler` | Test met een andere speler hoe goed jullie bij elkaar passen |

### Beheer (alleen met Server beheren)
De bot controleert zelf of je *Server beheren* hebt, ook als de command-permissies op de server zijn aangepast. Dat geldt ook voor de bevestigingsknop van `/verwijder`.

| Command | Beschrijving |
|---|---|
| `/voeg-toe type tekst` | Vraag of opdracht toevoegen (categorie `algemeen`) |
| `/verwijder type nummer` | Vraag of opdracht verwijderen, met bevestiging |
| `/lijst [type]` | Alle vragen met nummer |
| `/reload` | Gebruikte vragen van de sessie in dit kanaal resetten |
| `/reset` | Sessie in dit kanaal beëindigen |
| `/sessie starten\|lijst\|wisselen\|pauzeren\|hervatten\|stoppen\|info` | Sessies beheren |

---

## Punten en levels

| Actie | Punten |
|---|---|
| Ronde starten (`/wod`) | +5 |
| Ronde voltooien (Nieuwe ronde) | +5 |
| Reroll | −5 |
| Passen | −7 |
| Stemmen bij `/nooit` | +3 |
| `/relatietest` voltooien | +15 (beide spelers) |

Punten gaan nooit onder 0. Bij een nieuw level verschijnt een melding in het kanaal.

| Level | Titel | Punten |
|---|---|---|
| 1 | Lafaard | 0–49 |
| 2 | Deelnemer | 50–149 |
| 3 | Durfal | 150–349 |
| 4 | Avonturier | 350–699 |
| 5 | Onthulling | 700–1199 |
| 6 | Verleider | 1200–1999 |
| 7 | Kampioen | 2000–3499 |
| 8 | Legenda | 3500+ |

---

## Admin panel

| Pagina | Wat je er doet |
|---|---|
| **Vragen** | Vragen toevoegen, bewerken en verwijderen; categorie en DM-modus per vraag; CSV-import en -export |
| **Nooit** | Eigen "Nooit heb ik…"-stellingen |
| **Sessies** | Alle sessies bekijken en beëindigen |
| **Statistieken** | Aantal vragen en actieve sessies, rerolls per speler, reset en reload |
| **Ranglijst** | Top 10 met punten, level en achievements |
| **Instellingen** | Cooldown, DM-modus, categorie per kanaal, categoriemappen aanmaken, alles terugzetten |
| **Configuratie** | Alleen superadmins: redirect URI en frontend-URL van de login |
| **Servers** | Alleen superadmins: alle servers, overschakelen, bot laten vertrekken |

Onderaan de zijbalk wissel je tussen Nederlands en Engels.

Het panel controleert elke minuut opnieuw of je nog *Server beheren* hebt op de actieve server. Raak je die rechten kwijt, dan springt het panel naar een andere server, of naar het loginscherm als er geen server overblijft.

---

## Lokaal ontwikkelen

```bash
npm install
cp .env.example .env        # zodra .env.example bestaat; anders zelf .env aanmaken
node index.js               # bot + API op poort 3001, database in ./data

cd admin
npm install
npm run dev                 # panel met hot reload; /api en /auth gaan naar poort 3001
```

Gebruik bij voorkeur een aparte testbot en een testserver, zodat je de echte servers niet raakt. Voor de login lokaal: redirect `http://localhost:3001/auth/callback` in de Developer Portal en in `config.json`.

---

## Bouwen en publiceren

```bash
./build-and-push.sh
```

Bouwt het image met de versie uit `package.json` en pusht die tag en `:latest` naar GHCR. **Commit en push eerst naar GitHub**, zodat image en repo altijd dezelfde versie hebben.

## Versiebeheer

Semantic versioning (MAJOR.MINOR.PATCH), vastgelegd in `VERSION` en `package.json`. Commit message: `v<versie> — <korte omschrijving>`. Zie `BACKLOG.md` voor wat er per versie is uitgebracht en wat nog open staat.

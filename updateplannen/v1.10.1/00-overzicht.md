# v1.10.1 — Bugs en build bijwerken

**Doel:** de open bugs uit 🐛 oplossen. Categorieën worden eenduidig en gevalideerd, lange teksten breken niets meer en de migraties lopen netjes. Daarnaast wordt de build bijgewerkt: GitHub Actions op Node 24, een healthcheck, een nette afsluiting en een GitHub Release per versie.

Het gaat grotendeels om fixes. De optie `categorie` bij `/voeg-toe`, `GET /health` en de release zijn kleine aanvullingen die bij die fixes horen, daarom blijft het een patch.

## Scope

Uit 🐛 Bugs & opschoning:
- Migratie van `user_levels` in de verkeerde volgorde
- Duplicaten opruimen bij elke start
- Standaardcategorie is niet eenduidig (standaard `algemeen`, `/voeg-toe` krijgt een optie `categorie`)
- Categorie niet gevalideerd
- Lange vragen breken de embed
- `ephemeral: true` is verouderd
- Nieuw gevonden: de importmelding in `Vragen.jsx` staat hardcoded in JSX (tegen harde regel 12)

Uit ⚙️ Technisch & Infra:
- Actions bijwerken naar Node 24 (inclusief controle op Ubuntu 26)
- `NODE_ENV=production` in het image, met een eigen JSON-error-handler
- Healthcheck in de Dockerfile, met `GET /health`
- Nette afsluiting
- GitHub Release bij een nieuwe versie

## Buiten scope
- **Beurtrotatie per sessie en in de database:** gaat naar de focus-release "Timeout & beurten", omdat de timeout dezelfde tabel nodig heeft.
- **De bot zelf naar Node 24:** wordt een nieuw backlog-item. De bot en de Dockerfile blijven op Node 22, alleen de Actions-runtime gaat naar Node 24.
- **Bestaande vragen naar een andere categorie omzetten:** vragen die nu op `18+` of een onbekende categorie staan, blijven zoals ze zijn.
- **Volume en `DATA_DIR` in de Dockerfile, en een non-root gebruiker:** beide raken de bestaande mapping en de bestandsrechten op Unraid. Ze krijgen later een eigen patch met een migratiestap.
- Kleiner image, logging met tijdstempels, slash commands alleen bij wijziging registreren, `config.json` buiten het image, tests met `node:test`.

## Fases
1. **01-database-en-categorieen.md**: migraties met `PRAGMA table_info`, duplicaten eenmalig opruimen, standaardcategorie `algemeen`, categorie gevalideerd in API, CSV en `/voeg-toe`, onbekende categorieën gemarkeerd in het panel, importmelding via `t()`
2. **02-lengtes-en-ephemeral.md**: maximale lengte bij invoer (500 voor vragen, 300 voor stellingen), veilig afkappen bij tonen, `MessageFlags.Ephemeral`
3. **03-container-en-actions.md**: `NODE_ENV`, error-handler, `/health` en `HEALTHCHECK`, nette afsluiting, Actions op Node 24, GitHub Release, daarna afronden (versie, docs, release)

`VERSION` en `package.json` gaan pas in fase 3 naar `1.10.1`. Commits van fase 1 en 2 heten `v1.10.1 (fase N/3) — <omschrijving>`.

## Aandachtspunten

- **Database:** geen nieuwe tabellen of kolommen.
  - De `ALTER TABLE`-migraties komen ná alle `CREATE TABLE`-regels, via een helper met `PRAGMA table_info`.
  - Duplicaten worden alleen opgeruimd als de UNIQUE-index nog niet bestaat.
  - De kolomstandaard `DEFAULT '18+'` van `vragen.categorie` blijft in het schema staan. SQLite kan een standaard alleen wijzigen door de tabel opnieuw op te bouwen, en dat is het risico niet waard. In plaats daarvan geeft elke insert de categorie voortaan zelf mee.
- **Instellingen:** geen nieuwe.
- **Slash commands:**
  - `/voeg-toe` krijgt een verplichte optie `categorie` (keuzelijst met de vijf categorieën), en `tekst` een maximum van 500 tekens.
  - Bij `/nooit` krijgt de optie `stelling` een maximum van 300 tekens.
  - De bot registreert de commands bij de start, dus na de deploy zijn de wijzigingen er vanzelf.
- **Knoppen:** geen nieuwe of gewijzigde custom IDs.
- **API-routes:**
  - Nieuw: `GET /health`, zonder login en vóór de sessie-middleware.
  - `POST`/`PUT /api/vragen` en `POST`/`PUT /api/nooit` valideren categorie en lengte, met een 400 en de codes `ongeldige_categorie` of `te_lang`.
  - `POST /api/vragen/import` geeft ook `ongeldig` terug.
  - `POST /api/channel-categorie` accepteert alleen een geldige categorie.
  - `GET /api/categorieen` geeft de vaste lijst terug.
  - Nieuw: een JSON-error-handler voor ongeldige JSON (400), een te grote body (413) en overige fouten (500).
- **Vertaalsleutels (nl.js én en.js):**
  - Nieuw: `vragen.importToegevoegd`, `vragen.importOvergeslagen`, `vragen.importOngeldig`, `vragen.onbekendeCategorie`, `vragen.kiesCategorie`
  - Gewijzigd: `vragen.csvHint`
  - Weg als ongebruikt: `vragen.geimporteerd`
- **Packages:** geen nieuwe.
- **Omgevingsvariabelen:** geen nieuwe. `NODE_ENV=production` staat voortaan vast in de Dockerfile.
- **Discord-rechten en intents:** geen nieuwe.
- **Punten en data:** geen gevolgen voor punten. Bestaande vragen met een onbekende categorie blijven werken en spelen, maar het panel markeert ze. Bestaande kanaalkoppelingen aan een onbekende categorie blijven werken.
- **Risico's voor een bestaande installatie:**
  - Een CSV met eigen categorieën (bijv. `spicy`) importeert die regels niet meer; ze tellen als "ongeldig". Dit staat in de README.
  - Bestaande vragen langer dan 500 tekens blijven staan en worden bij het tonen afgekapt. Bewerken in het panel kan alleen als ze daarna binnen de limiet vallen.
  - Unraid toont na de update een gezondheidsstatus. Staat `ADMIN_PORT` op een andere poort, dan gebruikt de healthcheck die poort.
  - Docker geeft bij stoppen standaard 10 seconden; de bot stopt zelf uiterlijk na 8 seconden.
  - `ubuntu-latest` gaat vanaf 19 oktober 2026 naar Ubuntu 26. De runner wordt niet vastgezet, maar de eerste run na die datum moet je controleren.

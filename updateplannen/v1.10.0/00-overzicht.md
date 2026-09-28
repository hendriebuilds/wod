# v1.10.0 — Punten eerlijk

**Doel:** punten krijg je alleen nog voor echt meespelen. Alleen de speler aan de beurt kan de knoppen van zijn ronde gebruiken, farmen kan niet meer, en de achievements kloppen weer met de 8 levels. Daarnaast bouwt GitHub Actions voortaan het image, respecteert een gekoppeld kanaal zijn categorie zonder uitzonderingen, en overleeft een login van het panel een herstart. Nieuwe features, dus een minor-versie.

## Scope

Uit 👤 Punten, profielen & achievements:
- ⚠️ Punten farmen bij `/nooit`
- Alleen de speler aan de beurt mag klikken
- `/strafpunten`
- Relatietest niet te farmen

Uit 🐛 Bugs & opschoning:
- Achievements kloppen niet meer met de levels
- Achievements op twee plekken gedefinieerd
- Panel toont oude levelnamen op de ranglijst
- Veel dubbele code in knoppen en commands (nodig voor de knoppen-check, maakt fase 2 en 3 kleiner)

Uit 🔞 18+ en categorieën:
- Gekoppeld kanaal toont soms andere categorieën
- Categorie zichtbaar in de embed

Uit 🔐 Beveiliging:
- CSRF-bescherming op de API
- Sessies niet in het geheugen

Uit ⚙️ Technisch & Infra:
- GitHub Actions (plan van Hendrie, opgenomen als fase 1)
- `build-and-push.sh` leest `VERSION` (alleen dat deel, zie buiten scope)
- `dockerignore` (het bestand heet al `.dockerignore`; alleen de inhoud aanvullen)
- `admin/node_modules` en `admin/dist` uit git
- `package-lock.json` wél committen

## Buiten scope
- Ranglijst langer dan top 10, punten beheren in het panel (bewust later)
- Beurt overnemen, timeout, `/rejoin`; een admin kan dus **geen** ronde van een ander doorzetten
- Beurtrotatie per sessie en in de database (blijft per server en in het geheugen)
- Meer achievements, auditlog (de tabel `strafpunten` legt wel alvast vast wie wat deed)
- Optie "18+ alleen in eigen kanalen", meerdere categorieën per kanaal, leeftijdsrol
- Categorie valideren, standaardcategorie gelijktrekken, `/voeg-toe` met categorie-optie
- De uitgebreide controles van `build-and-push.sh` (repo schoon, alles gepusht)
- `ephemeral: true` → `MessageFlags.Ephemeral`

## Fases
1. **01-build-en-repo.md**: GitHub Actions, lock files en `npm ci`, `.dockerignore` aanvullen, `admin/node_modules` en `admin/dist` uit git
2. **02-rondes-en-beurt.md**: één `stuurVraag()`, de speler van de ronde in de custom IDs, alleen die speler kan klikken, nieuwe puntenverdeling, "heeft geantwoord, nu is X aan de beurt"
3. **03-categorieen.md**: geen fallback naar andere categorieën, nummers alleen binnen de categorie van het kanaal, categorie in de embed
4. **04-punten-en-achievements.md**: `/nooit` en relatietest niet te farmen, `/strafpunten`, achievements op één plek met eenmalige migratie, levelnamen in het panel
5. **05-panel-beveiliging.md**: sessies in SQLite, CSRF-bescherming, daarna afronden (versie, docs, release)

`VERSION` en `package.json` gaan pas in fase 5 naar `1.10.0`. Een nieuwe `VERSION` op `main` start de build. Commits van fase 1 t/m 4 heten `v1.10.0 (fase N/5) — <omschrijving>`.

## Aandachtspunten

- **Database:**
  - Nieuwe tabellen: `migraties` (eenmalige migraties bijhouden), `relatietest_punten` (fase 4), `strafpunten` (fase 4), `panel_sessies` (fase 5).
  - Eenmalige migratie `achievements_v1_10` (fase 4): level-achievements opnieuw berekend, "Lafaard"-achievement hernoemd naar "Schijterd", kolom `level` in `user_levels` gelijkgetrokken met de punten.
- **Instellingen:** geen nieuwe.
- **Slash commands:** nieuw `/strafpunten speler aantal reden` (admin). `/wod`, `/waarheid` en `/doen` houden hun opties.
- **Knoppen:** alle rondeknoppen krijgen de speler-ID erachter: `kies_waarheid_<id|open>`, `kies_doen_<id|open>`, `kies_random_<id|open>`, `reroll_waarheid_<id>`, `reroll_doen_<id>`, `passen_waarheid_<id>`, `passen_doen_<id>`, `nieuwe_ronde_<id>`. Knoppen zonder ID (van vóór de update) geven een melding dat de ronde verlopen is.
- **Punten:**

  | actie | oud | nieuw |
  |---|---|---|
  | `/wod` | +5 | 0 |
  | Waarheid/Doen/Verrassing kiezen (alleen de speler) | 0 | +5 |
  | Nieuwe ronde (alleen de speler) | +5 | +5 |
  | Reroll / Passen (alleen de speler) | −5 / −7 | −5 / −7 |
  | Stemmen bij `/nooit` | +3 per keer aanklikken | +3, één keer per stemming |
  | `/relatietest` voltooid | +15 beide, onbeperkt | +15 beide, één keer per paar per dag |
  | `/strafpunten` | — | −1 t/m −100 |

  Een gespeelde ronde levert netto nog steeds +10 op.
- **API-routes:** geen nieuwe. `GET /api/ranglijst` rekent het level uit de punten. `POST /api/vragen/import` krijgt JSON (`{ csv }`) in plaats van tekst. Alle schrijvende `/api`-routes en `POST /auth/logout` controleren de `Origin`.
- **Vertaalsleutels:** `ranglijst.levelNamen` krijgt 8 levels (NL en EN). Geen nieuwe sleutels.
- **Packages:** geen nieuwe. De sessie-store in SQLite is eigen code.
- **Omgevingsvariabelen:** geen nieuwe.
- **Discord-rechten en intents:** geen wijzigingen.
- **Bestaande punten en data:** punten blijven staan. Achievements worden eenmalig rechtgezet. Wie "Legenda" had op level 4 t/m 7 raakt die kwijt, wie "Durfal" had op level 2 ook. Wie een level-achievement verdient maar nog niet had, krijgt hem alsnog. Dit is bewust zo gekozen.
- **Risico's voor een bestaande installatie:**
  - ⚠️ **Package-toegang op GHCR** moet vóór de eerste push van fase 1 goed staan (zie fase 1, stap 7). Anders faalt de release in fase 5.
  - Rondes die openstaan tijdens de update werken niet meer: hun knoppen hebben geen speler-ID. Start een nieuwe ronde met `/wod`.
  - Door de lock files kunnen dependencies iets andere (nieuwere, binnen de semver-ranges) versies krijgen dan in het huidige image. Test het panel en de bot na fase 1 lokaal.
  - Na de update log je eenmalig opnieuw in op het panel (de sessies zaten in het geheugen). Daarna blijf je ingelogd na een herstart.
  - `admin/dist` staat niet meer in git. Lokaal met `node index.js` starten vraagt eerst `cd admin && npm run build`.
  - Een panel dat via een ander adres dan `frontendUrl` wordt geopend, kan na fase 5 niets meer opslaan (CSRF-controle). Gebruik altijd `<PANEL-URL>`.

## Aannames (zeg het als het anders moet)
- **Nieuwe ronde zonder rotatie:** staat er niemand in `/beurt`, dan is de volgende ronde "open". Wie als eerste op Waarheid, Doen of Verrassing klikt, is aan de beurt. Met een rotatie schuift de beurt door naar de volgende speler, zoals nu.
- **"Heeft geantwoord":** de nieuwe kies-embed na "Nieuwe ronde" noemt wie net heeft geantwoord en wie nu aan de beurt is. Er wordt niemand gepingd.
- **Achievement "Onthullingsmaster"** houdt zijn naam en wordt gekoppeld aan level 5 (Onthulling).

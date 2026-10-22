# Changelog

Alle noemenswaardige wijzigingen staan in dit bestand. Het formaat volgt [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/) en de versies volgen [Semantic Versioning](https://semver.org/lang/nl/).

## [Unreleased]

### Toegevoegd
- CI-workflow (`ci.yml`) bij elke pull request en push naar `main`: scan op gevoelige data en een syntaxcontrole van de bot na `npm ci`.
- `scripts/check_sensitive.py`: scan op IP-adressen, interne hostnames en secrets.
- `.env.example` met alle omgevingsvariabelen.
- `CHANGELOG.md`.

### Gewijzigd
- De GitHub Release van een versie gebruikt de bijbehorende sectie uit `CHANGELOG.md` als tekst (anders automatische notities).
- `config.json` in de repo bevat alleen nog placeholders. **Let op bij updaten:** mount je eigen `config.json` op `/app/config.json`, anders werkt de login niet meer.

## [1.10.1] - 2026-10-04

### Toegevoegd
- `/voeg-toe` heeft een verplichte optie `categorie`.
- `GET /health` en een `HEALTHCHECK` in de Dockerfile.
- Nette afsluiting bij `SIGTERM`/`SIGINT` (sessies opslaan, server, Discord en database sluiten).
- GitHub Release bij elke nieuwe versie.

### Gewijzigd
- Standaardcategorie is `algemeen`; categorieën worden gevalideerd in de API, de CSV-import en `/voeg-toe`. Onbekende categorieën worden in het panel gemarkeerd.
- Maximale lengte van 500 tekens voor vragen en 300 voor stellingen; lange bestaande teksten worden bij het tonen afgekapt.
- `MessageFlags.Ephemeral` in plaats van `ephemeral: true`.
- `NODE_ENV=production` in het image, met een JSON-error-handler in de API.
- GitHub Actions draaien op Node 24.

### Opgelost
- Migratie van `user_levels` liep in de verkeerde volgorde.
- Dubbele vragen werden bij elke start opnieuw opgeruimd.
- De importmelding in het panel was niet vertaald.

# v1.9.3 — Veiligheid & stabiliteit

**Doel:** de bot crasht niet meer door één mislukte interactie, en het panel, de login en de admin-acties zijn goed afgeschermd. Alleen fixes, geen nieuwe features, dus een patch-versie.

## Scope

Uit 🐛 Bugs & opschoning:
- ⚠️ Level-up melding via knoppen werkt niet
- ⚠️ Een fout in een command of knop laat de bot crashen
- Cooldown laat de interactie hangen (plus cooldown per server)

Uit 🔐 Beveiliging:
- ⚠️ Elke server-admin kan de loginconfiguratie van de hele bot wijzigen
- ⚠️ `SESSION_SECRET` verplicht maken
- ⚠️ Verwijderknop controleert geen rechten (plus alle admin commands)
- Verplichte omgevingsvariabelen controleren bij het starten
- OAuth `state`-parameter
- Rechten alleen bij het inloggen gecontroleerd
- Sessie-cookie instellen
- Security headers op het panel
- `cors` kan weg
- Kanaal bij categorie-koppeling niet gecontroleerd
- `allowedMentions` beperken

Uit ⏱ Beurten:
- Beurtrotatie beheren alleen voor admins: `/beurt reset` en `/beurt verwijder`

## Buiten scope
- CSRF-bescherming op de API (`M`), in een volgende versie
- Sessie-store in SQLite (`M`), in een volgende versie. Na een herstart blijft iedereen dus nog uitgelogd.
- Auditlog, `npm audit` en Dependabot
- Achievements rechtzetten en de migratievolgorde van `user_levels`
- Alles uit 🔞 (categorie-fallback, meerdere categorieën per kanaal)
- Standaard doorvoeren: `.dockerignore`, `admin/dist` uit git, `config.json` als volume. Alleen het bestand `VERSION` wordt bij het afronden aangemaakt, omdat de werkwijze erom vraagt.
- `/beurt toevoegen` en `/beurt volgende` blijven voor iedereen

## Fases
1. **01-crashbestendig.md**: foutafhandeling in `interactionCreate` plus globale handlers, level-up fix, cooldown met melding, `allowedMentions`
2. **02-panel-en-login.md**: env-controle bij start, `SESSION_SECRET` verplicht, `/api/config` alleen voor superadmins, cookie, OAuth `state`, security headers, `cors` eruit
3. **03-rechten.md**: rechtencontrole in admin commands, admin-knoppen en `/beurt`, herhaalde rechtencontrole in het panel, kanaalvalidatie

## Aandachtspunten

- **Database:** geen wijzigingen.
- **Instellingen:** geen nieuwe.
- **Slash commands en knoppen:** geen nieuwe of hernoemde. Admin commands (`src/commands/admin/*`), de knop `verwijder_ja_<id>` en `/beurt reset|verwijder` controleren nu zelf op *Server beheren*. Alleen de beschrijvingen van `/beurt reset` en `/beurt verwijder` veranderen. De bot registreert die automatisch opnieuw bij `ready`.
- **API-routes:** geen nieuwe. `GET/PUT /api/config` krijgen `requireSuperAdmin`. `requireGuild` wordt async en controleert de rechten opnieuw. `POST /api/channel-categorie` valideert het kanaal. `/auth/callback` redirect bij fouten naar `?error=…` in plaats van een kale 500.
- **Vertaalsleutels (nl.js én en.js):** `login.errorState` en `login.errorMislukt`.
- **Packages:** `cors` wordt verwijderd. Er komen geen nieuwe packages bij (`crypto` is ingebouwd).
- **Omgevingsvariabelen:** `SESSION_SECRET` wordt **verplicht** en moet minimaal 32 tekens hebben. `DISCORD_CLIENT_ID` en `DISCORD_CLIENT_SECRET` worden ook verplicht bij het starten.
- **Discord-rechten en intents:** geen wijzigingen. `guild.members.fetch(userId)` voor één lid werkt zonder de privileged intent *Server Members*.
- **Punten en data:** blijven ongewijzigd. De level-up melding bij "Nieuwe ronde" en `/nooit` verschijnt nu wel.
- **Risico's voor een bestaande installatie:**
  - ⚠️ **De container start niet** als `SESSION_SECRET` ontbreekt of korter is dan 32 tekens. Controleer dit vóór de update (zie "Upgradestap").
  - Iedereen is na de update eenmalig uitgelogd, door de nieuwe cookie-instellingen en de herstart.
  - De cookie is `secure`. De login werkt dus alleen via `<PANEL-URL>` over HTTPS. De reverse proxy moet `X-Forwarded-Proto` meesturen. Zonder die header lukt het inloggen niet (je belandt steeds weer op het loginscherm).
  - Na een `uncaughtException` stopt het proces bewust met exitcode 1. De container moet daarom een restart policy hebben (`unless-stopped` of `always`).
  - Staan er in de code bewuste pings (`<@id>`)? Die worden na de `allowedMentions`-wijziging stil, tenzij ze expliciet toegestaan worden (zie fase 1).

## Upgradestap (vóór het uitrollen)

Controleer de lengte van het secret in de draaiende container:

```sh
docker exec <CONTAINER> sh -c 'printf %s "$SESSION_SECRET" | wc -c'
```

Is de uitkomst lager dan 32, genereer dan een nieuw secret en zet het in de container-instellingen op Unraid:

```sh
openssl rand -hex 32
```

## Afronden (na fase 3)
- `VERSION` aanmaken met `1.9.3` en `package.json` bijwerken naar `1.9.3`.
- README: tabel met omgevingsvariabelen (`SESSION_SECRET` verplicht, minimaal 32 tekens), opmerking over HTTPS, `X-Forwarded-Proto` en de restart policy.
- CLAUDE.md: Toegangsregel (admin commands en knoppen controleren zelf, `requireGuild` controleert opnieuw), API-routes (`/api/config` alleen voor superadmins), omgevingsvariabelen, nieuwe bestanden `src/env.js` en `src/permissions.js`.
- BACKLOG.md: bovenstaande items op `[x]` zetten en een blok "✅ Uitgebracht in v1.9.3 — Veiligheid & stabiliteit" toevoegen.
- Commit: `v1.9.3 — veiligheid & stabiliteit`, pushen, daarna `build-and-push.sh`.

# Fase 2 — Panel en login dichtzetten

## Doel
De bot start alleen met een geldige configuratie. Alleen superadmins kunnen de loginconfiguratie zien en wijzigen. De sessie-cookie, de OAuth-flow en de HTTP-headers zijn veilig ingesteld, en `cors` is verdwenen.

## Bestanden
- `src/env.js`: **nieuw**
- `index.js`: aangepast (volgorde van de imports)
- `src/server.js`: aangepast
- `admin/src/components/Layout.jsx`: aangepast (pagina Configuratie)
- `admin/src/pages/Login.jsx`: aangepast
- `admin/src/i18n/nl.js` en `en.js`: nieuwe sleutels
- `package.json`: `cors` eruit

## Stappen

### 1. Env laden vóór alles (`index.js`)
Nu staat `dotenv.config()` ná de imports. Bij ES modules worden alle imports eerst geëvalueerd, dus `src/server.js` leest `process.env.SESSION_SECRET` al vóórdat `.env` geladen is. Dat viel niet op door de fallback. Zonder fallback breekt het lokaal draaien met `.env`.
- Maak de eerste twee regels van `index.js`:
  ```js
  import 'dotenv/config';
  import './src/env.js';
  ```
- Verwijder `import * as dotenv` en `dotenv.config()`.

### 2. Controle bij het starten (`src/env.js`)
Code die direct uitgevoerd wordt als de module geladen wordt:
```js
const VERPLICHT = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'SESSION_SECRET'];
const ontbreekt = VERPLICHT.filter(k => !process.env[k]?.trim());
if (ontbreekt.length) {
  console.error(`❌ Ontbrekende omgevingsvariabelen: ${ontbreekt.join(', ')}. De bot stopt.`);
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error('❌ SESSION_SECRET moet minimaal 32 tekens lang zijn. Genereer er een met: openssl rand -hex 32');
  process.exit(1);
}
```
Log alleen de **namen** van de variabelen, nooit de waarden of de lengte van het secret.

### 3. Sessie en cookie (`src/server.js`)
```js
app.set('trust proxy', 1);
app.use(session({
  name: 'wod.sid',
  secret: process.env.SESSION_SECRET,           // geen fallback meer
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.frontendUrl.startsWith('https://'),
    maxAge: 24 * 60 * 60 * 1000,
  },
}));
```
- `sameSite: 'lax'` is nodig: `'strict'` stuurt de cookie niet mee bij de redirect terug van Discord, en dan werkt de controle van `state` niet.
- `secure` hangt af van `frontendUrl`. Lokaal op `http://localhost` werkt de login dus nog. Productie draait op HTTPS, dus daar is de cookie altijd `secure`.
- Log bij het starten één regel: `🔒 Sessie-cookie: secure=${secure}`.

### 4. OAuth `state` en sessiefixatie (`src/server.js`)
- `GET /auth/login`:
  ```js
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  // … params met state
  req.session.save(() => res.redirect(`https://discord.com/api/oauth2/authorize?${params}`));
  ```
  (`import crypto from 'node:crypto';`)
- `GET /auth/callback`:
  - Klopt `req.query.state` niet met `req.session.oauthState` (of ontbreekt een van beide), dan `delete req.session.oauthState` en `res.redirect(`${config.frontendUrl}?error=ongeldige_login`)`.
  - Na een geldige state: `delete req.session.oauthState`.
  - Vóór het zetten van `req.session.user`: `req.session.regenerate(err => { … })` en daarin `user`, `guilds` en `activeGuildId` zetten, dan `req.session.save(() => res.redirect(config.frontendUrl))`. Zo krijgt de gebruiker na het inloggen een nieuwe sessie-ID.
  - In de `catch`: loggen en daarna `res.redirect(`${config.frontendUrl}?error=login_mislukt`)` in plaats van `res.status(500).send(…)`.

### 5. Foutmeldingen op het loginscherm
- `admin/src/pages/Login.jsx`: behalve `geen_toegang` ook `ongeldige_login` → `t('login.errorState')` en `login_mislukt` → `t('login.errorMislukt')`. Gebruik een kleine map van foutcode naar sleutel, niet drie losse `&&`-blokken.
- Nieuwe sleutels:
  | sleutel | nl | en |
  |---|---|---|
  | `login.errorState` | Inloggen is verlopen of ongeldig. Probeer het opnieuw. | Login expired or was invalid. Please try again. |
  | `login.errorMislukt` | Inloggen is mislukt. Probeer het later opnieuw. | Login failed. Please try again later. |

### 6. `/api/config` alleen voor superadmins
- `src/server.js`: `app.get('/api/config', requireSuperAdmin, …)` en `app.put('/api/config', requireSuperAdmin, …)`.
- `PUT`: valideer beide velden met `new URL(value)`. Alleen het protocol `http:` of `https:` is toegestaan, en `redirectUri` moet eindigen op `/auth/callback`. Bij een ongeldige waarde `400 { error: 'Ongeldige URL.' }`, en er wordt niets opgeslagen.
- `admin/src/components/Layout.jsx`: toon `configuratie` in de navigatie alleen als `user.isSuperAdmin`, op dezelfde manier als `servers`. Staat de opgeslagen of actieve pagina op `configuratie` voor een niet-superadmin, val dan terug op de eerste pagina.
- De tekst `configuratie.meerServersText2` zegt dat vragen tussen servers gedeeld worden. Dat klopt niet meer. Pas de tekst in nl en en aan ("Vragen, sessies en instellingen zijn per server gescheiden." / "Questions, sessions and settings are separate per server.").

### 7. Security headers (`src/server.js`)
Middleware bovenaan, vóór de routes:
```js
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  next();
});
app.disable('x-powered-by');
```
Geen `Content-Security-Policy` in deze versie (buiten scope).

### 8. `cors` verwijderen
- Verwijder `import cors` en `app.use(cors(…))` uit `src/server.js`.
- `npm uninstall cors`.
- Controleer `admin/vite.config.js`: werkt `npm run dev` in `admin/` via een `proxy` naar `:3001`? Zo niet, voeg dan een `server.proxy` toe voor `/api` en `/auth`, zodat lokaal ontwikkelen zonder CORS werkt.

## Databasewijzigingen
Geen.

## Klaar als
- [x] Zonder `SESSION_SECRET`, of met een secret korter dan 32 tekens, stopt de bot met een duidelijke logregel en exitcode 1. Hetzelfde geldt als een van de andere drie verplichte variabelen ontbreekt.
- [ ] Lokaal met `.env` start de bot gewoon (dotenv wordt als eerste geladen). _(volgorde in de code klopt; niet gestart, geen Node op de ontwikkelmachine)_
- [x] In `src/server.js` staat geen fallback-secret meer.
- [x] De cookie heet `wod.sid` en heeft `HttpOnly`, `SameSite=Lax`, en `Secure` achter HTTPS.
- [x] De login gebruikt `state`, een ongeldige state geeft `?error=ongeldige_login`, en na het inloggen krijg je een nieuwe sessie-ID.
- [x] `GET/PUT /api/config` geeft 403 voor niet-superadmins, en de pagina Configuratie is voor hen onzichtbaar.
- [x] De vier security headers staan op elke response, en `X-Powered-By` ontbreekt.
- [ ] `cors` staat niet meer in `package.json`, en `npm run dev` in `admin/` werkt nog. _(`cors` is weg en de proxy in `vite.config.js` bestond al; `npm run dev` niet getest)_
- [x] Nieuwe sleutels staan in `nl.js` én `en.js`.

## Teststappen
1. **Start zonder secret:** start lokaal met `SESSION_SECRET=kort`. De bot stopt met de melding over 32 tekens. Met een lang secret start de bot.
2. **Login:** log in via `<PANEL-URL>`. Dit werkt. In de devtools, onder *Application → Cookies*, staat `wod.sid` met HttpOnly, Secure en Lax.
3. **State:** open `<PANEL-URL>/auth/callback?code=abc&state=fout`. Je komt op het loginscherm met "Inloggen is verlopen of ongeldig."
4. **Configuratie:** log in met een account dat *Server beheren* heeft op een testserver, maar geen superadmin is. De pagina Configuratie is niet zichtbaar, en `fetch('/api/config')` in de console geeft 403. Met je superadmin-account is de pagina zichtbaar, en een ongeldige URL opslaan geeft een foutmelding.
5. **Headers:** voer `curl -sI <PANEL-URL>/` uit. De vier headers staan erbij, `X-Powered-By` niet.
6. **Taal:** zet het panel op EN en forceer beide loginfouten. De teksten zijn Engels.

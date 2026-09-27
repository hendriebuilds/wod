# Fase 3 — Rechten in Discord en panel

## Doel
Admin-acties in Discord controleren zelf of je *Server beheren* hebt, en vertrouwen niet alleen op `setDefaultMemberPermissions`. Het panel controleert opnieuw of je nog toegang hebt tot de actieve server. Een kanaal koppelen aan een categorie kan alleen met een echt tekstkanaal van die server.

## Bestanden
- `src/permissions.js`: **nieuw**
- `index.js`: aangepast (command loader en dispatch)
- `src/buttons.js`: aangepast
- `src/commands/game/beurt.js`: aangepast
- `src/server.js`: aangepast (`requireGuild`, `POST /api/guild`, `POST /api/channel-categorie`)
- `admin/src/api.js`: aangepast (401/403 afhandelen)

## Stappen

### 1. Helper (`src/permissions.js`)
```js
import { PermissionFlagsBits } from 'discord.js';

export function isGuildAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export const GEEN_RECHTEN = { content: '🔒 Dit mag alleen een admin (Server beheren).', ephemeral: true };
```
`has()` telt *Administrator* standaard mee, dus admins en de eigenaar mogen het altijd.

### 2. Admin commands centraal (`index.js`)
- Sla in de command loader ook de categorie op: `commandMap.set(mod.data.name, { mod, cat })`.
- In `interactionCreate`:
  ```js
  const entry = commandMap.get(interaction.commandName);
  if (!entry) return;
  if (entry.cat === 'admin' && !isGuildAdmin(interaction)) {
    await interaction.reply(GEEN_RECHTEN);
    return;
  }
  await entry.mod.execute(interaction, ctx);
  ```
- Pas ook de registratie in `ready` aan: `[...commandMap.values()].map(e => e.mod.data.toJSON())`.
- `setDefaultMemberPermissions` in de commands blijft staan, voor wie het command te zien krijgt.

### 3. Admin-knoppen (`src/buttons.js`)
- Maak een inventaris van alle custom IDs die in `src/commands/admin/*` aangemaakt worden (`grep -rn "setCustomId" src/commands/admin/`). Zeker `verwijder_ja_<id>`, mogelijk ook knoppen van `/sessie` of `/reset`.
- Bovenaan elk van die knoppen in `handleButton` (vóór enige actie):
  ```js
  if (!isGuildAdmin(interaction)) { await interaction.reply(GEEN_RECHTEN); return; }
  ```
- Voor `verwijder_ja_<id>`: controleer ook dat het verwijderen gebeurt met `guildId` in de WHERE (zodat een ID van een andere server niets doet). Parseer het ID met `parseInt` en weiger `NaN`.
- `verwijder_nee` mag iedereen gebruiken (annuleren).
- Zet de lijst met beveiligde custom IDs als commentaar bovenaan `buttons.js`, voor later.

### 4. `/beurt reset` en `/beurt verwijder` (`src/commands/game/beurt.js`)
- Bovenaan de subcommands `reset` en `verwijder`: `if (!isGuildAdmin(interaction)) { await interaction.reply(GEEN_RECHTEN); return; }`
- `toevoegen`, `lijst` en `volgende` blijven voor iedereen.
- Pas de beschrijvingen van de subcommands aan: `'Verwijder een speler uit de rotatie. (Alleen voor admins)'` en `'Wis de rotatie. (Alleen voor admins)'`. Dit vraagt om herregistratie, maar dat gebeurt automatisch bij `ready`.

### 5. Rechten opnieuw controleren in het panel (`src/server.js`)
Nieuwe helper met een korte cache:
```js
const toegangCache = new Map(); // `${userId}:${guildId}` → { ok, verloopt }
const TOEGANG_TTL = 60_000;

async function heeftToegang(userId, guildId) {
  if (isSuperAdmin(userId)) return true;
  const sleutel = `${userId}:${guildId}`;
  const hit = toegangCache.get(sleutel);
  if (hit && hit.verloopt > Date.now()) return hit.ok;
  let ok = false;
  const guild = _client.guilds.cache.get(guildId);
  if (guild) {
    try {
      const member = await guild.members.fetch(userId);
      ok = member.permissions.has(PermissionFlagsBits.ManageGuild);
    } catch { ok = false; } // geen lid meer
  }
  toegangCache.set(sleutel, { ok, verloopt: Date.now() + TOEGANG_TTL });
  return ok;
}
```
- Er is geen extra intent nodig: één lid ophalen via `members.fetch(id)` werkt met alleen `Guilds`.
- Een fout van Discord zelf (bijv. timeout, 5xx) mag niet leiden tot het intrekken van de toegang. Vang die apart af: bij `DiscordAPIError` met code `10007` (Unknown Member) of `10004` (Unknown Guild) geldt `ok = false`, bij andere fouten `next(err)` of 503, zonder de gebruiker eruit te gooien en zonder te cachen.
- `requireGuild` wordt `async`:
  1. Geen `activeGuildId` → 400 (zoals nu).
  2. `await heeftToegang(user.id, activeGuildId)` levert `false` op → verwijder de server uit `req.session.guilds` en `toegangCache`.
     - Blijven er servers over: `activeGuildId = guilds[0].id`, `403 { error: 'Geen toegang meer tot deze server.', code: 'geen_toegang_server' }`.
     - Geen servers meer: `req.session.destroy()` en `401 { error: 'Niet ingelogd' }`.
- `POST /api/guild`: roep voor niet-superadmins ook `heeftToegang()` aan, vóór het wisselen van server.
- Maak gewone Express-errors van async-middleware goed af (Express 4 vangt geen rejections op): `try/catch` in `requireGuild`, met `next(err)` bij een fout.

### 6. Panel reageert op verlies van toegang (`admin/src/api.js`)
In `req()` en `reqText()`, vóór `throw`:
- Status `401` en het pad is niet `/auth/me` → `window.location.reload()` (het loginscherm verschijnt).
- Status `403` met `code === 'geen_toegang_server'` → `window.location.reload()` (het panel laadt met de volgende server).

Lees de body één keer uit (`const tekst = await res.text()`) en probeer `JSON.parse` in een `try`.

### 7. Kanaal valideren bij categorie-koppeling (`src/server.js`)
In `POST /api/channel-categorie`:
- `channelId` moet een string van alleen cijfers zijn (`/^\d{17,20}$/`), anders 400.
- `const kanaal = _client.guilds.cache.get(guildId)?.channels.cache.get(channelId)`. Bestaat het kanaal niet, of is het geen `ChannelType.GuildText`, dan `400 { error: 'Ongeldig kanaal.' }`. Gebruik dezelfde toegestane types als `GET /api/kanalen`, zodat de keuzelijst en de validatie overeenkomen.
- `categorie`: een niet-lege string van maximaal 50 tekens, anders 400.

## Databasewijzigingen
Geen.

## Klaar als
- [x] Alle commands in `src/commands/admin/` weigeren gebruikers zonder *Server beheren* met een ephemeral 🔒-melding, ook als de command-permissies op de server zijn aangepast.
- [x] `verwijder_ja_<id>` en alle andere admin-knoppen controleren de rechten, en verwijderen alleen binnen de eigen server.
- [x] `/beurt reset` en `/beurt verwijder` zijn alleen voor admins. `toevoegen`, `lijst` en `volgende` werken voor iedereen.
- [x] `requireGuild` controleert de rechten opnieuw (cache van 60 s). Wie de rechten kwijtraakt, verliest binnen een minuut de toegang tot die server in het panel.
- [x] Een tijdelijke fout van Discord gooit niemand uit het panel.
- [x] `POST /api/channel-categorie` weigert kanalen van een andere server en niet-tekstkanalen.
- [x] De lijst met beveiligde custom IDs staat als commentaar in `buttons.js`.

## Teststappen
Gebruik een tweede Discord-account (hierna: testaccount) en twee servers, A en B.
1. **Admin command:** geef op server A onder *Server Settings → Integrations → WoD* het command `/verwijder` vrij voor @everyone. Het testaccount (zonder *Server beheren*) krijgt bij `/verwijder` de 🔒-melding.
2. **Verwijderknop:** laat als admin `/verwijder` het bevestigingsbericht tonen, klik op "Ja". De vraag is weg. De eigen controle in de knop test je door tijdelijk `isGuildAdmin` in de knop op `false` te zetten, of vertrouw op de codereview.
3. **Beurt:** met het testaccount werken `/beurt toevoegen` en `/beurt volgende`. `/beurt reset` en `/beurt verwijder` geven de 🔒-melding. Als admin werken ze.
4. **Rechten intrekken:** geef het testaccount op server A een rol met *Server beheren* en log in op het panel. Haal de rol weg en wacht een minuut. Bij de volgende actie op server A springt het panel naar een andere server, of naar het loginscherm als dat de enige server was.
5. **Andere server:** het testaccount is admin op A, niet op B. Een handmatige `fetch('/api/guild', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ guildId: '<ID-B>' }) })` in de console geeft 403.
6. **Kanaal:** stuur als admin van A een `POST /api/channel-categorie` met het ID van een kanaal op server B, en daarna met een spraakkanaal van A. Beide keren 400. Een gewoon tekstkanaal van A werkt.
7. **Superadmin:** met je superadmin-account werken alle servers nog, ook zonder *Server beheren*.

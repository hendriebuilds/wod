# Fase 1 — Crashbestendig

## Doel
Een fout in een command of knop geeft de speler een nette melding en laat het proces niet crashen. De level-up melding werkt ook via knoppen. Een cooldown geeft antwoord in plaats van "Deze interactie is mislukt". De bot pingt nooit per ongeluk iemand.

## Bestanden
- `index.js`: aangepast
- `src/buttons.js`: aangepast
- `src/game.js`: aangepast (cooldown)
- `src/interactionError.js`: **nieuw**

## Stappen

### 1. Helper voor foutmeldingen: `src/interactionError.js`
```js
export async function replyError(interaction, err, label) {
  console.error(`❌ Fout in ${label} (guild ${interaction.guildId ?? '-'}):`, err);
  if (!interaction.isRepliable()) return;
  const payload = { content: '❌ Er ging iets mis. Probeer het nog eens.', ephemeral: true };
  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (e) {
    console.error('❌ Foutmelding sturen mislukt:', e.message);
  }
}
```
- `label` is `/<commandName>` of `knop <customId>`.
- Log nooit tokens, secrets of volledige request-objecten, alleen `err` (met stack).

### 2. `interactionCreate` in `index.js`
- Zet de hele body (ook de "alleen in servers"-reply) in `try { … } catch (err) { await replyError(interaction, err, label); }`.
- `label`: bij een command `` `/${interaction.commandName}` ``, bij een knop `` `knop ${interaction.customId}` ``.

### 3. Globale handlers in `index.js`
Direct na het aanmaken van de client:
```js
client.on('error', err => console.error('❌ Discord client-fout:', err));
client.on('shardError', err => console.error('❌ Shard-fout:', err));
process.on('unhandledRejection', err => console.error('❌ Onafgehandelde rejection:', err));
process.on('uncaughtException', err => {
  console.error('❌ Onafgevangen exception, proces stopt:', err);
  process.exit(1); // Docker restart policy herstart de container
});
```
Een `unhandledRejection` laat de bot doordraaien. Een `uncaughtException` laat de bot bewust stoppen, omdat de staat van het proces daarna onbetrouwbaar is. Zet dit ook in de README (restart policy).

### 4. Level-up melding via knoppen (`src/buttons.js`)
- Voeg bovenaan toe: `import * as embeds from './embeds.js';`. Controleer eerst dat `embeds.js` niets uit `buttons.js` importeert (geen circulaire import).
- De parameter `embeds` in `handleButton` blijft werken. Dezelfde module, geen gedragsverschil.
- `stuurLevelUpNotificatie()` werkt nu bij "Nieuwe ronde" en bij stemmen in `/nooit`.

### 5. Cooldown (`src/game.js` + `src/buttons.js`)
- `inCooldown(userId, guildId)`: sleutel `` `${guildId}:${userId}` `` in plaats van alleen `userId`, in zowel `has`, `add` als `delete`.
- In `handleButton`:
  ```js
  if (game.inCooldown(interaction.user.id, guildId)) {
    await interaction.reply({ content: '⏳ Rustig aan! Even wachten…', ephemeral: true });
    return;
  }
  ```
  Gebruik `interaction.user.id`, niet `user.id ?? …`. `member.id` en `user.id` zijn gelijk, maar dit is eenduidiger.
- Controleer of er nog andere aanroepen van `inCooldown` zijn (bijv. in commands) en pas die op dezelfde manier aan.

### 6. `allowedMentions`
- Globaal in de client-opties: `new Client({ intents: [...], allowedMentions: { parse: [], repliedUser: false } })`.
- Zoek met `grep -rn "<@" src/` naar bewuste pings. Moet een bewuste ping blijven werken, geef dan bij dat bericht expliciet `allowedMentions: { users: [id] }` mee. Tekst van spelers (stellingen, namen, vragen) krijgt nooit een uitzondering.

## Databasewijzigingen
Geen.

## Klaar als
- [x] `interactionCreate` heeft een `try/catch` met `replyError`, en een fout geeft een ephemeral "❌ Er ging iets mis." in plaats van een crash.
- [x] `client.on('error')`, `shardError`, `unhandledRejection` en `uncaughtException` zijn geregistreerd.
- [x] Een level-up via "Nieuwe ronde" of `/nooit` stuurt de level-up embed in het kanaal.
- [x] De cooldown geeft een ephemeral melding en geldt per server (`guildId:userId`).
- [x] De client heeft `allowedMentions: { parse: [] }`, en bewuste pings zijn geïnventariseerd.
- [ ] De bot start zonder fouten en alle bestaande knoppen werken. _(niet lokaal getest: geen Node op de ontwikkelmachine; handmatig nagekeken)_

## Teststappen
1. **Crash:** haal in een testkanaal bij de bot het recht *Berichten beheren* weg en klik op een knop die `interaction.message.delete()` doet (bijv. "Nieuwe ronde", als die dat doet), of haal *Berichten versturen* weg en speel een ronde. Je krijgt een foutmelding of er gebeurt niets zichtbaars, de log toont een regel met `❌ Fout in knop …`, en de bot blijft online (probeer daarna `/wod` in een ander kanaal).
2. **Level-up:** zet in het panel (of via de database) je punten net onder een levelgrens (bijv. 48) en klik op "Nieuwe ronde". De paarse level-up embed verschijnt in het kanaal.
3. **Cooldown:** zet de cooldown op 5000 ms en klik twee keer snel op een knop. De tweede klik geeft "⏳ Rustig aan!". Er verschijnt geen "Deze interactie is mislukt".
4. **Cooldown per server:** klik op server A en direct daarna op server B. Op server B word je niet geblokkeerd.
5. **Mentions:** voeg een Nooit-stelling toe met `@everyone` erin en speel die met `/nooit`. Er wordt niemand gepingd.

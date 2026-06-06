Implementeer WoD Bot v1.9.2 volgens onderstaande fases. Werk de fases in volgorde af.
Commit aan het einde van elke fase. Stel vragen als iets onduidelijk is — ga niet gokken.

Doel
Voorkom dat dubbele vragen in de database terechtkomen, zowel via CSV-import in het
admin panel als via het /voeg-toe commando. De check is per guild (niet globaal),
case-insensitive, en geïmplementeerd op database-niveau.

Fase 1 — Database: UNIQUE constraint toevoegen
Wat
Voeg een UNIQUE constraint toe op (guild_id, tekst) in de vragen-tabel, zodat de
database zelf duplicaten weigert. Gebruik LOWER(tekst) via een generated column of
handle dit via de applicatielaag (zie hieronder).
Aanpak
SQLite ondersteunt geen UNIQUE constraint op een expressie zoals LOWER(tekst) direct
op de tabel, maar het ondersteunt wel partial/expression indexes:
sqlCREATE UNIQUE INDEX IF NOT EXISTS idx_vragen_guild_tekst_uniq
ON vragen (guild_id, LOWER(tekst));
Voeg deze index toe in de initDatabase() functie in src/database.js, ná de bestaande
tabel-aanmaak statements. Dit is een migratie-veilige toevoeging: IF NOT EXISTS zorgt
dat het op bestaande installaties gewoon werkt.
Resultaat

Bij een INSERT van een vraag die al bestaat (zelfde guild_id, zelfde tekst
case-insensitive) gooit SQLite een constraint error.
Gebruik voortaan INSERT OR IGNORE INTO vragen ... in plaats van INSERT INTO vragen ...
voor alle vraag-inserts. Zo wordt een duplicaat stil geskipped door SQLite en krijg je
via changes terug hoeveel rows daadwerkelijk ingevoegd zijn.

Bestanden

src/database.js — index toevoegen in initDatabase()
Controleer of bestaande insert-statements al OR IGNORE gebruiken; pas aan waar nodig


Fase 2 — /voeg-toe commando: duplicaat-melding
Wat
Als een vraag al bestaat in de guild, geef een duidelijke foutmelding terug in plaats van
stil te falen.
Aanpak
In src/commands/admin/voeg-toe.js, na de insert:
jsconst stmt = db.prepare('INSERT OR IGNORE INTO vragen (guild_id, tekst, categorie, dm_only) VALUES (?, ?, ?, ?)');
const result = stmt.run(guildId, tekst, categorie, dmOnly);

if (result.changes === 0) {
  return interaction.reply({
    content: '⚠️ Deze vraag bestaat al in deze server (of een identieke variant).',
    ephemeral: true
  });
}

// bestaande success-reply
Bestanden

src/commands/admin/voeg-toe.js


Fase 3 — CSV-import in admin panel: duplicaat-rapportage
Wat
Na een CSV-import toont het admin panel hoeveel vragen toegevoegd zijn en hoeveel
overgeslagen zijn wegens duplicaat.
Backend (src/server.js)
Zoek de import-route (POST /api/vragen/import of vergelijkbaar). Verander de insert-loop
zodat je bijhoudt hoeveel rows daadwerkelijk ingevoegd zijn:
jslet toegevoegd = 0;
let overgeslagen = 0;

const stmt = db.prepare('INSERT OR IGNORE INTO vragen (guild_id, tekst, categorie, dm_only) VALUES (?, ?, ?, ?)');

for (const vraag of vragen) {
  const result = stmt.run(guildId, vraag.tekst, vraag.categorie, vraag.dm_only ?? 0);
  if (result.changes === 1) {
    toegevoegd++;
  } else {
    overgeslagen++;
  }
}

res.json({ success: true, toegevoegd, overgeslagen });
Frontend (admin/src/pages/Vragen.jsx)
Toon na een succesvolle import een melding met beide getallen. Gebruik de bestaande
notificatie/toast-stijl die al in het panel aanwezig is:

Als overgeslagen === 0: "✅ {toegevoegd} vragen toegevoegd."
Als overgeslagen > 0: "✅ {toegevoegd} vragen toegevoegd, {overgeslagen} overgeslagen (duplicaat)."

Bestanden

src/server.js — import-route aanpassen
admin/src/pages/Vragen.jsx — melding tonen na import


Checklist voor Claude Code

 Fase 1: UNIQUE INDEX toegevoegd in initDatabase() in src/database.js
 Fase 1: Alle vraag-inserts gebruiken INSERT OR IGNORE
 Fase 2: /voeg-toe geeft ephemeral foutmelding bij duplicaat
 Fase 3: Import-route retourneert { toegevoegd, overgeslagen }
 Fase 3: Admin panel toont import-samenvatting met duplicaat-telling
 Versienummer bijgewerkt naar 1.9.2 in package.json
 Getest: zelfde vraag twee keer importeren via CSV → correcte telling
 Getest: zelfde vraag via /voeg-toe → ephemeral melding
Level & Punten Uitbreiding

Overzicht
Dit plan beschrijft drie wijzigingen:

Puntensysteem aanpassen (nieuwe waarden)
Levels uitbreiden van 4 naar 8 met nieuwe drempels en titels
Level-up notificatie in het kanaal


Fase 1 — Puntensysteem aanpassen
Wijzigingen in src/database.js (of waar punten worden toegekend)
Zoek alle plekken waar punten worden opgeteld/afgetrokken en pas de waarden aan:
ActieOudNieuwRonde starten (/wod)+5+5 (ongewijzigd)Ronde voltooien (Nieuwe ronde knop)+10+5Reroll-1-5Passen-3-7Stemmen in /nooit+3+3 (ongewijzigd)/relatietest voltooien+15+15 (ongewijzigd)
Punten mogen nooit onder 0 zakken — bestaande clamp-logica controleren en waar nodig toepassen: Math.max(0, huidigePunten + delta).

Fase 2 — Levels uitbreiden
Nieuwe level-tabel
Vervang de huidige level-definitie (4 levels) door onderstaande tabel. Dit is een constante in de code — waarschijnlijk in src/database.js of src/commands/game/profiel.js.
jsconst LEVELS = [
  { level: 1, titel: 'Lafaard',    min: 0    },
  { level: 2, titel: 'Deelnemer',  min: 50   },
  { level: 3, titel: 'Durfal',     min: 150  },
  { level: 4, titel: 'Avonturier', min: 350  },
  { level: 5, titel: 'Onthulling', min: 700  },
  { level: 6, titel: 'Verleider',  min: 1200 },
  { level: 7, titel: 'Kampioen',   min: 2000 },
  { level: 8, titel: 'Legenda',    min: 3500 },
];
Helper-functie
Zorg dat de bestaande getLevelInfo(punten) functie (of equivalent) correct werkt met 8 levels:
jsfunction getLevelInfo(punten) {
  let huidig = LEVELS[0];
  for (const l of LEVELS) {
    if (punten >= l.min) huidig = l;
    else break;
  }
  const volgend = LEVELS.find(l => l.min > punten) ?? null;
  const voortgang = volgend
    ? Math.floor(((punten - huidig.min) / (volgend.min - huidig.min)) * 100)
    : 100;
  return { ...huidig, volgend, voortgang };
}
/profiel embed
De embed toont al level en titel — controleer dat de weergave correct is met 8 levels. Geen structurele wijzigingen nodig tenzij de titel hardcoded is.
Bestaande data
Geen databasemigratie nodig. Punten blijven ongewijzigd; de nieuwe drempels worden automatisch toegepast bij het opvragen van levelinfo.

Fase 3 — Level-up notificatie
Wanneer
Na elke actie waarbij punten worden toegekend of afgetrokken, controleer of het nieuwe level verschilt van het level vóór de actie. Zo ja: stuur een notificatie in het kanaal.
Logica
In de functie die punten toekent (bijv. kenPuntenToe of equivalent):
jsconst levelVoor = getLevelInfo(huidigePunten).level;
const nieuwePunten = Math.max(0, huidigePunten + delta);
// sla nieuwePunten op in DB
const levelNa = getLevelInfo(nieuwePunten).level;

if (levelNa > levelVoor) {
  // stuur level-up notificatie
  await stuurLevelUpNotificatie(interaction, user, getLevelInfo(nieuwePunten));
}

Let op: alleen notificeren bij stijging, niet bij daling (reroll/passen kan geen level-up triggeren).

Notificatie-embed
jsfunction buildLevelUpEmbed(user, levelInfo) {
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('🎉 Level Up!')
    .setDescription(
      `**${user.displayName ?? user.username}** is gestegen naar ` +
      `**Lv.${levelInfo.level} — ${levelInfo.titel}**!`
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();
}
Versturen
De notificatie wordt verstuurd als interaction.channel.send(...) — niet als reply of ephemeral, zodat iedereen het ziet.
jsasync function stuurLevelUpNotificatie(interaction, user, levelInfo) {
  try {
    await interaction.channel.send({
      embeds: [buildLevelUpEmbed(user, levelInfo)],
    });
  } catch (err) {
    console.error('Level-up notificatie mislukt:', err);
  }
}
De try/catch voorkomt dat een mislukte notificatie de gameflow onderbreekt.

Checklist voor Claude Code

 Fase 1: Puntwaarden aanpassen op alle plekken in de code
 Fase 1: Controleer clamp-logica (punten >= 0)
 Fase 2: LEVELS constante vervangen door nieuwe tabel (8 levels)
 Fase 2: getLevelInfo() werkt correct met nieuwe tabel
 Fase 2: /profiel embed correct met nieuwe levels
 Fase 3: Level-up detectie na elke puntenmutatie
 Fase 3: buildLevelUpEmbed() toevoegen
 Fase 3: stuurLevelUpNotificatie() toevoegen
 package.json versie bijwerken naar 1.9.0
 Commit message: chore: bump version to 1.9.0


Notities

Bestaande gebruikerspunten worden niet gereset — nieuwe drempels gelden direct.
Spelers met veel punten (bijv. 718p) starten automatisch op het juiste hogere level.
Bij de eerste sessie na de update kunnen meerdere level-up notificaties achter elkaar verschijnen als een speler meerdere levels overslaat — dat is acceptabel gedrag.
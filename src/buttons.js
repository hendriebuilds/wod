import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import * as embeds from './embeds.js';
import { isGuildAdmin, GEEN_RECHTEN } from './permissions.js';
import { achievementEmoji } from './game.js';
import { parseRondeKnop, claimBericht, geefBerichtVrij, kiesVraag, stuurVraag, geenVraagMelding } from './ronde.js';

// Beveiligde knoppen (alleen Server beheren), gecontroleerd in handleButton:
// - verwijder_ja_<vraagId>  (uit /verwijder)
// verwijder_nee (annuleren) mag iedereen.

async function notifyAchievements(interaction, achievements) {
  for (const naam of achievements) {
    await interaction.followUp({ content: `${achievementEmoji(naam)} **Achievement behaald:** ${naam}!`, flags: MessageFlags.Ephemeral });
  }
}

async function stuurLevelUpNotificatie(interaction, user, levelInfo) {
  try {
    await interaction.channel.send({ embeds: [embeds.buildLevelUpEmbed(user, levelInfo)] });
  } catch (err) {
    console.error('Level-up notificatie mislukt:', err);
  }
}

// ─── Rondeknoppen ──────────────────────────────────────────────────────────────
// Alleen de speler van de ronde (in de custom ID) kan klikken, en alleen die
// speler krijgt of verliest punten. Zie src/ronde.js voor de custom IDs.

async function geefPunten(interaction, game, speler, delta) {
  const { achievements, levelVoor, levelNa, levelInfo } = game.voegPuntenToe(interaction.guildId, speler.id, speler.naam, delta);
  if (levelNa > levelVoor) await stuurLevelUpNotificatie(interaction, interaction.member ?? interaction.user, levelInfo);
  await notifyAchievements(interaction, achievements);
}

async function handleRondeKnop(interaction, ronde, { stmts, game, embeds }) {
  if (ronde.legacy) {
    await interaction.reply({ content: '⌛ Deze ronde is van vóór een update. Start een nieuwe met /wod.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (ronde.spelerId !== 'open' && interaction.user.id !== ronde.spelerId) {
    await interaction.reply({ content: `🙅 Het is de beurt van <@${ronde.spelerId}>.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return;
  }
  const messageId = interaction.message.id;
  if (!claimBericht(messageId)) {
    await interaction.deferUpdate();
    return;
  }

  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const speler = { id: interaction.user.id, naam: interaction.member?.displayName ?? interaction.user.username };

  if (ronde.actie === 'kies') {
    let type = ronde.type;
    let vraag;
    if (type === 'random') {
      // Loten; is het ene type leeg, dan het andere
      const volgorde = Math.random() < 0.5 ? ['waarheid', 'doen'] : ['doen', 'waarheid'];
      for (const t of volgorde) {
        vraag = kiesVraag(guildId, channelId, t);
        type = t;
        if (vraag) break;
      }
    } else {
      vraag = kiesVraag(guildId, channelId, type);
    }
    if (!vraag) {
      geefBerichtVrij(messageId);
      await interaction.reply({ content: geenVraagMelding(guildId, channelId, type), flags: MessageFlags.Ephemeral });
      return;
    }
    const update = { components: [embeds.buildDisabledKiesButtons(speler.id)] };
    if (ronde.spelerId === 'open') update.embeds = [embeds.buildKiesEmbed({ spelerNaam: speler.naam })];
    await interaction.update(update);
    await stuurVraag(interaction, { type, speler, variant: 'normaal', vraag, via: 'followUp' });
    await geefPunten(interaction, game, speler, 5);
    return;
  }

  if (ronde.actie === 'reroll' || ronde.actie === 'passen') {
    const type = ronde.type;
    const vraag = kiesVraag(guildId, channelId, type);
    if (!vraag) {
      geefBerichtVrij(messageId);
      await interaction.reply({ content: geenVraagMelding(guildId, channelId, type), flags: MessageFlags.Ephemeral });
      return;
    }
    if (ronde.actie === 'reroll') {
      const sessieId = game.getSessieId(guildId, channelId);
      const cache = game.getSessieCache(sessieId);
      const huidig = cache.rerollTeller.get(speler.id) ?? { naam: speler.naam, teller: 0 };
      cache.rerollTeller.set(speler.id, { naam: speler.naam, teller: huidig.teller + 1 });
      game.saveSessieCache(sessieId);
    }
    await interaction.deferUpdate();
    await interaction.message.delete();
    await stuurVraag(interaction, { type, speler, variant: ronde.actie === 'reroll' ? 'reroll' : 'straf', vraag, via: 'followUp' });
    await geefPunten(interaction, game, speler, ronde.actie === 'reroll' ? -5 : -7);
    if (ronde.actie === 'reroll') stmts.incrReroll.run(guildId, speler.id);
    else stmts.incrPassen.run(guildId, speler.id);
    // Na de teller: "Reroll addict" en "Schijterd" direct bij de juiste klik
    await notifyAchievements(interaction, game.checkAchievements(guildId, speler.id));
    return;
  }

  // Nieuwe ronde: de speler heeft geantwoord, de beurt schuift door
  const { achievements, levelVoor, levelNa, levelInfo } = game.voegPuntenToe(guildId, speler.id, speler.naam, 5);
  stmts.incrRondes.run(guildId, speler.id);
  achievements.push(...game.checkAchievements(guildId, speler.id)); // "Op dreef" na de teller
  await interaction.update({ components: [] });
  const volgende = game.getBeurten(guildId).lijst.length > 0 ? game.advanceerBeurt(guildId) : null;
  await interaction.followUp({
    embeds: [embeds.buildKiesEmbed({ spelerNaam: volgende?.naam ?? null, vorigeNaam: speler.naam })],
    components: [embeds.buildKiesButtons(volgende?.id ?? 'open')],
  });
  if (levelNa > levelVoor) await stuurLevelUpNotificatie(interaction, interaction.member ?? interaction.user, levelInfo);
  await notifyAchievements(interaction, achievements);
}

export async function handleButton(interaction, { client, db, stmts, game, embeds }) {
  const guildId = interaction.guildId;
  const user = interaction.member ?? interaction.user;

  if (game.inCooldown(interaction.user.id, guildId)) {
    await interaction.reply({ content: '⏳ Rustig aan! Even wachten…', flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Rondeknoppen (kies, reroll, passen, nieuwe ronde) ──

  const ronde = parseRondeKnop(interaction.customId);
  if (ronde) {
    await handleRondeKnop(interaction, ronde, { stmts, game, embeds });
    return;
  }

  // ── Nooit stemmen ──

  if (interaction.customId.startsWith('nooit_')) {
    const delen = interaction.customId.split('_');
    const actie = delen[1];
    const sessionId = delen.slice(2).join('_');
    const sessie = game.nooitStemmen.get(sessionId);
    if (!sessie) { await interaction.reply({ content: 'Stemming verlopen.', flags: MessageFlags.Ephemeral }); return; }
    const userId = interaction.user.id;
    const naam = interaction.member?.displayName ?? interaction.user.username;
    if (actie === 'sluit') {
      clearTimeout(sessie.timeout);
      game.nooitStemmen.delete(sessionId);
      const welNamen = embeds.naamLijst(sessie.wel.values()) || 'niemand';
      const nooitNamen = embeds.naamLijst(sessie.nooit.values()) || 'niemand';
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('🍺 Nooit heb ik... — Uitslag')
          .setDescription(`**${embeds.kapAf(sessie.stelling, embeds.LIMIET.beschrijving - 10)}**`)
          .addFields(
            { name: `🍺 Wel gedaan (${sessie.wel.size})`, value: welNamen, inline: true },
            { name: `✋ Nooit gedaan (${sessie.nooit.size})`, value: nooitNamen, inline: true }
          )
          .setTimestamp()],
        components: [],
      });
      return;
    }
    if (actie !== 'wel' && actie !== 'nooit') { await interaction.reply({ content: '❌ Ongeldige knop.', flags: MessageFlags.Ephemeral }); return; }
    // Stemmen, uitzetten en wisselen kan onbeperkt; punten alleen voor de eerste stem.
    const gekozen = sessie[actie];
    const ander = actie === 'wel' ? sessie.nooit : sessie.wel;
    if (gekozen.has(userId)) gekozen.delete(userId);
    else { gekozen.set(userId, naam); ander.delete(userId); }
    await interaction.update({ components: [embeds.buildNooitButtons(sessionId, sessie.wel.size, sessie.nooit.size)] });
    if (gekozen.has(userId) && !sessie.beloond.has(userId)) {
      sessie.beloond.add(userId);
      const { achievements, levelVoor, levelNa, levelInfo } = game.voegPuntenToe(guildId, userId, naam, 3);
      if (levelNa > levelVoor) await stuurLevelUpNotificatie(interaction, interaction.member ?? interaction.user, levelInfo);
      await notifyAchievements(interaction, achievements);
    }
    return;
  }

  // ── Persoonlijkheidstest buttons ──

  if (interaction.customId === 'pt_A' || interaction.customId === 'pt_B') {
    const userId = interaction.user.id;
    const sessie = game.persoonlijkheidSessies.get(userId);
    if (!sessie) { await interaction.update({ content: '❌ Sessie verlopen. Gebruik `/persoonlijkheid` om opnieuw te beginnen.', embeds: [], components: [] }); return; }
    sessie.antwoorden.push(interaction.customId === 'pt_A' ? 'A' : 'B');
    sessie.vraagIndex++;
    if (sessie.vraagIndex >= game.PERSOONLIJKHEID_VRAGEN.length) {
      clearTimeout(sessie.timeout);
      game.persoonlijkheidSessies.delete(userId);
      const rZelfinzicht1 = stmts.insertAchievement.run(guildId, interaction.user.id, 'Zelfinzicht');
      await interaction.update({ content: '✅ Test voltooid! Je resultaat wordt zo geplaatst...', embeds: [], components: [] });
      const kanaal = client.channels.cache.get(sessie.channelId);
      if (kanaal) await kanaal.send({ embeds: [embeds.buildPersoonlijkheidResultaatEmbed(user, sessie.antwoorden)] });
      if (rZelfinzicht1.changes > 0) await interaction.followUp({ content: '🧠 **Achievement behaald:** Zelfinzicht!', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.update({ embeds: [embeds.buildPersoonlijkheidVraagEmbed(sessie.vraagIndex)], components: [embeds.buildPersoonlijkheidButtons()] });
    }
    return;
  }

  // ── Relatietest buttons ──

  if (interaction.customId.startsWith('rt_')) {
    const delen = interaction.customId.split('_');
    const actie = delen[1];
    const sessionId = delen.slice(2).join('_');
    const sessie = game.relatieSessies.get(sessionId);
    if (!sessie) { await interaction.reply({ content: '❌ Sessie verlopen.', flags: MessageFlags.Ephemeral }); return; }
    const userId = interaction.user.id;
    if (actie === 'start') {
      if (userId !== sessie.speler2.id) { await interaction.reply({ content: '❌ Deze uitdaging is niet voor jou.', flags: MessageFlags.Ephemeral }); return; }
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(0xeb459e).setTitle('💑 Relatietest gestart!').setDescription(`**${sessie.speler2.naam}** doet mee! De uitslag volgt zodra jullie allebei klaar zijn.`)],
        components: [],
      });
      await interaction.followUp({ embeds: [embeds.buildRelatieVraagEmbed(0, sessie.speler2.naam)], components: [embeds.buildRelatieButtons(sessionId)], flags: MessageFlags.Ephemeral });
      return;
    }
    const isSpeler1 = userId === sessie.speler1.id;
    const isSpeler2 = userId === sessie.speler2.id;
    if (!isSpeler1 && !isSpeler2) { await interaction.reply({ content: '❌ Jij doet niet mee aan deze relatietest.', flags: MessageFlags.Ephemeral }); return; }
    const speler = isSpeler1 ? sessie.speler1 : sessie.speler2;
    speler.antwoorden.push(actie === 'A' ? 'A' : 'B');
    if (speler.antwoorden.length >= game.RELATIE_VRAGEN.length) {
      await interaction.update({ content: '✅ Jouw antwoorden zijn opgeslagen! Wachten op de ander...', embeds: [], components: [] });
      if (sessie.speler1.antwoorden.length >= game.RELATIE_VRAGEN.length && sessie.speler2.antwoorden.length >= game.RELATIE_VRAGEN.length) {
        clearTimeout(sessie.timeout);
        game.relatieSpelers.delete(sessie.speler1.id);
        game.relatieSpelers.delete(sessie.speler2.id);
        game.relatieSessies.delete(sessionId);
        // Punten één keer per paar per dag (Europe/Amsterdam); Lovebird altijd.
        const [spelerA, spelerB] = [sessie.speler1.id, sessie.speler2.id].sort();
        const datum = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
        const puntenGegeven = stmts.insertRelatietestPunten.run(guildId, spelerA, spelerB, datum).changes === 1;
        const uitslagen = [sessie.speler1, sessie.speler2].map(s => {
          const r = puntenGegeven
            ? game.voegPuntenToe(guildId, s.id, s.naam, 15)
            : { achievements: [], levelVoor: 0, levelNa: 0 };
          if (stmts.insertAchievement.run(guildId, s.id, 'Lovebird').changes > 0) r.achievements.push('Lovebird');
          return { speler: s, ...r };
        });
        const kanaal = client.channels.cache.get(sessie.channelId);
        if (kanaal) {
          await kanaal.send({ embeds: [embeds.buildRelatieResultaatEmbed(sessie, puntenGegeven)] });
          for (const u of uitslagen) {
            if (u.levelNa > u.levelVoor) await kanaal.send({ embeds: [embeds.buildLevelUpEmbed(await client.users.fetch(u.speler.id), u.levelInfo)] });
          }
          for (const u of uitslagen) {
            for (const naam of u.achievements) {
              await kanaal.send({ content: `${achievementEmoji(naam)} **Achievement behaald voor ${u.speler.naam}:** ${naam}!` });
            }
          }
        }
      }
    } else {
      await interaction.update({ embeds: [embeds.buildRelatieVraagEmbed(speler.antwoorden.length, speler.naam)], components: [embeds.buildRelatieButtons(sessionId)] });
    }
    return;
  }

  // ── Liefdestaal buttons ──

  if (interaction.customId === 'lt_A' || interaction.customId === 'lt_B') {
    const userId = interaction.user.id;
    const sessie = game.liefdestaalSessies.get(userId);
    if (!sessie) {
      await interaction.update({ content: '❌ Sessie verlopen. Gebruik `/liefdestaal` om opnieuw te beginnen.', embeds: [], components: [] });
      return;
    }
    sessie.antwoorden.push(interaction.customId === 'lt_A' ? 'A' : 'B');
    sessie.vraagIndex++;
    if (sessie.vraagIndex >= game.LIEFDESTAAL_VRAGEN.length) {
      clearTimeout(sessie.timeout);
      game.liefdestaalSessies.delete(userId);
      const rZelfinzicht2 = stmts.insertAchievement.run(guildId, interaction.user.id, 'Zelfinzicht');
      await interaction.update({ content: '✅ Test voltooid! Je uitslag wordt zo geplaatst...', embeds: [], components: [] });
      const kanaal = client.channels.cache.get(sessie.channelId);
      if (kanaal) await kanaal.send({ embeds: [embeds.buildLiefdestaalResultaatEmbed(user, sessie.antwoorden)] });
      if (rZelfinzicht2.changes > 0) await interaction.followUp({ content: '🧠 **Achievement behaald:** Zelfinzicht!', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.update({ embeds: [embeds.buildLiefdestaalVraagEmbed(sessie.vraagIndex)], components: [embeds.buildLiefdestaalButtons()] });
    }
    return;
  }

  // ── Verwijder bevestiging buttons ──

  if (interaction.customId.startsWith('verwijder_ja_')) {
    if (!isGuildAdmin(interaction)) { await interaction.reply(GEEN_RECHTEN); return; }
    const vraagId = parseInt(interaction.customId.replace('verwijder_ja_', ''), 10);
    if (Number.isNaN(vraagId)) { await interaction.reply({ content: '❌ Ongeldige knop.', flags: MessageFlags.Ephemeral }); return; }
    const vraag = db.prepare('SELECT * FROM vragen WHERE id = ? AND guild_id = ?').get(vraagId, guildId);
    if (!vraag) {
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Niet gevonden').setDescription('De vraag bestaat niet meer.').setTimestamp()],
        components: [],
      });
      return;
    }
    stmts.deleteVraagById.run(vraagId, guildId);
    const guildSessies = stmts.getSessiesGuild.all(guildId);
    for (const s of guildSessies) {
      const cache = game.sessieCache.get(s.id);
      if (cache) {
        if (vraag.type === 'waarheid') cache.gebruikteWaarheid.delete(vraagId);
        else cache.gebruikteDoen.delete(vraagId);
      }
    }
    await interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🗑️ Verwijderd')
        .setDescription(embeds.kapAf(`Vraag verwijderd:\n\n> ${vraag.tekst}`, embeds.LIMIET.beschrijving))
        .setTimestamp()],
      components: [],
    });
    return;
  }

  if (interaction.customId === 'verwijder_nee') {
    await interaction.update({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('✅ Geannuleerd').setDescription('De verwijdering is geannuleerd.').setTimestamp()],
      components: [],
    });
  }
}

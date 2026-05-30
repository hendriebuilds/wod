import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const ACHIEVEMENT_EMOJIS = {
  'Eerste stap': '👣', 'Durfal': '💪', 'Onthullingsmaster': '🔓',
  'Legenda': '👑', 'Reroll addict': '🎲', 'Lafaard': '😅',
  'Op dreef': '🔥', 'Lovebird': '💑', 'Zelfinzicht': '🧠',
};

async function notifyAchievements(interaction, achievements) {
  for (const naam of achievements) {
    const emoji = ACHIEVEMENT_EMOJIS[naam] ?? '🏆';
    await interaction.followUp({ content: `${emoji} **Achievement behaald:** ${naam}!`, ephemeral: true });
  }
}

export async function handleButton(interaction, { client, db, stmts, game, embeds }) {
  const guildId = interaction.guildId;
  const user = interaction.member ?? interaction.user;

  if (game.inCooldown(user.id ?? interaction.user.id, guildId)) return;

  // ── Kies buttons ──

  if (interaction.customId === 'kies_waarheid') {
    await interaction.update({ components: [embeds.buildDisabledKiesButtons()] });
    const sessieId = game.getSessieId(guildId, interaction.channelId);
    const catFilter = game.getCategorieFilter(guildId, interaction.channelId);
    const vraag = game.getVraag(guildId, 'waarheid', catFilter, sessieId);
    if (!vraag) { await interaction.followUp({ content: '❌ Geen waarheidsvragen beschikbaar.', ephemeral: true }); return; }
    const cache = game.getSessieCache(sessieId);
    cache.aantalWaarheid++;
    game.saveSessieCache(sessieId);
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || vraag.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)] });
        await interaction.followUp({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('waarheid')] });
      } catch {
        await interaction.followUp({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
      }
    } else {
      await interaction.followUp({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
    }
    return;
  }

  if (interaction.customId === 'kies_doen') {
    await interaction.update({ components: [embeds.buildDisabledKiesButtons()] });
    const sessieId = game.getSessieId(guildId, interaction.channelId);
    const catFilter = game.getCategorieFilter(guildId, interaction.channelId);
    const opdracht = game.getVraag(guildId, 'doen', catFilter, sessieId);
    if (!opdracht) { await interaction.followUp({ content: '❌ Geen doe-opdrachten beschikbaar.', ephemeral: true }); return; }
    const cache = game.getSessieCache(sessieId);
    cache.aantalDoen++;
    game.saveSessieCache(sessieId);
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || opdracht.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)] });
        await interaction.followUp({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('doen')] });
      } catch {
        await interaction.followUp({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('doen')] });
      }
    } else {
      await interaction.followUp({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('doen')] });
    }
    return;
  }

  if (interaction.customId === 'kies_random') {
    await interaction.update({ components: [embeds.buildDisabledKiesButtons()] });
    const sessieId = game.getSessieId(guildId, interaction.channelId);
    const catFilter = game.getCategorieFilter(guildId, interaction.channelId);
    const inst = game.dbGetInstellingen(guildId);
    if (Math.random() < 0.5) {
      const vraag = game.getVraag(guildId, 'waarheid', catFilter, sessieId);
      if (!vraag) { await interaction.followUp({ content: '❌ Geen waarheidsvragen beschikbaar.', ephemeral: true }); return; }
      const cache = game.getSessieCache(sessieId);
      cache.aantalWaarheid++;
      game.saveSessieCache(sessieId);
      if (inst.dmModus || vraag.dm_modus) {
        try {
          await interaction.user.send({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)] });
          await interaction.followUp({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('waarheid')] });
        } catch {
          await interaction.followUp({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
        }
      } else {
        await interaction.followUp({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
      }
    } else {
      const opdracht = game.getVraag(guildId, 'doen', catFilter, sessieId);
      if (!opdracht) { await interaction.followUp({ content: '❌ Geen doe-opdrachten beschikbaar.', ephemeral: true }); return; }
      const cache = game.getSessieCache(sessieId);
      cache.aantalDoen++;
      game.saveSessieCache(sessieId);
      if (inst.dmModus || opdracht.dm_modus) {
        try {
          await interaction.user.send({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)] });
          await interaction.followUp({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('doen')] });
        } catch {
          await interaction.followUp({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('doen')] });
        }
      } else {
        await interaction.followUp({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('doen')] });
      }
    }
    return;
  }

  // ── Reroll buttons ──

  if (interaction.customId === 'reroll_waarheid') {
    const sessieId = game.getSessieId(guildId, interaction.channelId);
    const cache = game.getSessieCache(sessieId);
    const userId = user.id ?? interaction.user.id;
    const huidig = cache.rerollTeller.get(userId) ?? { naam: user.displayName, teller: 0 };
    cache.rerollTeller.set(userId, { naam: user.displayName, teller: huidig.teller + 1 });
    const achRerollW = game.voegPuntenToe(guildId, interaction.user.id, user.displayName, -1);
    stmts.incrReroll.run(guildId, interaction.user.id);
    const catFilter = game.getCategorieFilter(guildId, interaction.channelId);
    const vraag = game.getVraag(guildId, 'waarheid', catFilter, sessieId);
    if (!vraag) { await interaction.reply({ content: '❌ Geen waarheidsvragen beschikbaar.', ephemeral: true }); return; }
    game.saveSessieCache(sessieId);
    await interaction.deferUpdate();
    await interaction.message.delete();
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || vraag.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, true, sessieId)] });
        await interaction.followUp({ content: `📩 Reroll verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('waarheid')] });
      } catch {
        await interaction.followUp({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, true, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
      }
    } else {
      await interaction.followUp({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, true, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
    }
    await notifyAchievements(interaction, achRerollW);
    return;
  }

  if (interaction.customId === 'reroll_doen') {
    const sessieId = game.getSessieId(guildId, interaction.channelId);
    const cache = game.getSessieCache(sessieId);
    const userId = user.id ?? interaction.user.id;
    const huidig = cache.rerollTeller.get(userId) ?? { naam: user.displayName, teller: 0 };
    cache.rerollTeller.set(userId, { naam: user.displayName, teller: huidig.teller + 1 });
    const achRerollD = game.voegPuntenToe(guildId, interaction.user.id, user.displayName, -1);
    stmts.incrReroll.run(guildId, interaction.user.id);
    const catFilter = game.getCategorieFilter(guildId, interaction.channelId);
    const opdracht = game.getVraag(guildId, 'doen', catFilter, sessieId);
    if (!opdracht) { await interaction.reply({ content: '❌ Geen doe-opdrachten beschikbaar.', ephemeral: true }); return; }
    game.saveSessieCache(sessieId);
    await interaction.deferUpdate();
    await interaction.message.delete();
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || opdracht.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, true, sessieId)] });
        await interaction.followUp({ content: `📩 Reroll verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('doen')] });
      } catch {
        await interaction.followUp({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, true, sessieId)], components: [embeds.buildActieButtons('doen')] });
      }
    } else {
      await interaction.followUp({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, true, sessieId)], components: [embeds.buildActieButtons('doen')] });
    }
    await notifyAchievements(interaction, achRerollD);
    return;
  }

  // ── Passen buttons ──

  if (interaction.customId === 'passen_waarheid') {
    const sessieId = game.getSessieId(guildId, interaction.channelId);
    const vraag = game.getVraag(guildId, 'waarheid', game.getCategorieFilter(guildId, interaction.channelId), sessieId);
    if (!vraag) { await interaction.reply({ content: '❌ Geen waarheidsvragen beschikbaar.', ephemeral: true }); return; }
    const achPassenW = game.voegPuntenToe(guildId, interaction.user.id, user.displayName, -3);
    stmts.incrPassen.run(guildId, interaction.user.id);
    await interaction.deferUpdate();
    await interaction.message.delete();
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || vraag.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildStrafWaarheidEmbed(vraag.tekst, user, guildId, sessieId)] });
        await interaction.followUp({ content: `📩 Strafvraag verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('waarheid')] });
      } catch {
        await interaction.followUp({ embeds: [embeds.buildStrafWaarheidEmbed(vraag.tekst, user, guildId, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
      }
    } else {
      await interaction.followUp({ embeds: [embeds.buildStrafWaarheidEmbed(vraag.tekst, user, guildId, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
    }
    await notifyAchievements(interaction, achPassenW);
    return;
  }

  if (interaction.customId === 'passen_doen') {
    const sessieId = game.getSessieId(guildId, interaction.channelId);
    const opdracht = game.getVraag(guildId, 'doen', game.getCategorieFilter(guildId, interaction.channelId), sessieId);
    if (!opdracht) { await interaction.reply({ content: '❌ Geen doe-opdrachten beschikbaar.', ephemeral: true }); return; }
    const achPassenD = game.voegPuntenToe(guildId, interaction.user.id, user.displayName, -3);
    stmts.incrPassen.run(guildId, interaction.user.id);
    await interaction.deferUpdate();
    await interaction.message.delete();
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || opdracht.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildStrafDoenEmbed(opdracht.tekst, user, guildId, sessieId)] });
        await interaction.followUp({ content: `📩 Strafopdracht verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('doen')] });
      } catch {
        await interaction.followUp({ embeds: [embeds.buildStrafDoenEmbed(opdracht.tekst, user, guildId, sessieId)], components: [embeds.buildActieButtons('doen')] });
      }
    } else {
      await interaction.followUp({ embeds: [embeds.buildStrafDoenEmbed(opdracht.tekst, user, guildId, sessieId)], components: [embeds.buildActieButtons('doen')] });
    }
    await notifyAchievements(interaction, achPassenD);
    return;
  }

  // ── Nooit stemmen ──

  if (interaction.customId.startsWith('nooit_')) {
    const delen = interaction.customId.split('_');
    const actie = delen[1];
    const sessionId = delen.slice(2).join('_');
    const sessie = game.nooitStemmen.get(sessionId);
    if (!sessie) { await interaction.reply({ content: 'Stemming verlopen.', ephemeral: true }); return; }
    const userId = interaction.user.id;
    const naam = interaction.member?.displayName ?? interaction.user.username;
    if (actie === 'sluit') {
      clearTimeout(sessie.timeout);
      game.nooitStemmen.delete(sessionId);
      const welNamen = [...sessie.wel.values()].join(', ') || 'niemand';
      const nooitNamen = [...sessie.nooit.values()].join(', ') || 'niemand';
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('🍺 Nooit heb ik... — Uitslag')
          .setDescription(`**${sessie.stelling}**`)
          .addFields(
            { name: `🍺 Wel gedaan (${sessie.wel.size})`, value: welNamen, inline: true },
            { name: `✋ Nooit gedaan (${sessie.nooit.size})`, value: nooitNamen, inline: true }
          )
          .setTimestamp()],
        components: [],
      });
      return;
    }
    if (actie === 'wel') {
      if (sessie.wel.has(userId)) { sessie.wel.delete(userId); }
      else {
        if (!sessie.wel.has(userId) && !sessie.nooit.has(userId)) {
          const achNooit = game.voegPuntenToe(guildId, interaction.user.id, naam, 3);
          await interaction.update({ components: [embeds.buildNooitButtons(sessionId, sessie.wel.size + 1, sessie.nooit.size)] });
          sessie.wel.set(userId, naam); sessie.nooit.delete(userId);
          await notifyAchievements(interaction, achNooit);
          return;
        }
        sessie.wel.set(userId, naam); sessie.nooit.delete(userId);
      }
    } else {
      if (sessie.nooit.has(userId)) { sessie.nooit.delete(userId); }
      else {
        if (!sessie.wel.has(userId) && !sessie.nooit.has(userId)) {
          const achNooit = game.voegPuntenToe(guildId, interaction.user.id, naam, 3);
          await interaction.update({ components: [embeds.buildNooitButtons(sessionId, sessie.wel.size, sessie.nooit.size + 1)] });
          sessie.nooit.set(userId, naam); sessie.wel.delete(userId);
          await notifyAchievements(interaction, achNooit);
          return;
        }
        sessie.nooit.set(userId, naam); sessie.wel.delete(userId);
      }
    }
    await interaction.update({ components: [embeds.buildNooitButtons(sessionId, sessie.wel.size, sessie.nooit.size)] });
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
      if (rZelfinzicht1.changes > 0) await interaction.followUp({ content: '🧠 **Achievement behaald:** Zelfinzicht!', ephemeral: true });
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
    if (!sessie) { await interaction.reply({ content: '❌ Sessie verlopen.', ephemeral: true }); return; }
    const userId = interaction.user.id;
    if (actie === 'start') {
      if (userId !== sessie.speler2.id) { await interaction.reply({ content: '❌ Deze uitdaging is niet voor jou.', ephemeral: true }); return; }
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(0xeb459e).setTitle('💑 Relatietest gestart!').setDescription(`**${sessie.speler2.naam}** doet mee! De uitslag volgt zodra jullie allebei klaar zijn.`)],
        components: [],
      });
      await interaction.followUp({ embeds: [embeds.buildRelatieVraagEmbed(0, sessie.speler2.naam)], components: [embeds.buildRelatieButtons(sessionId)], ephemeral: true });
      return;
    }
    const isSpeler1 = userId === sessie.speler1.id;
    const isSpeler2 = userId === sessie.speler2.id;
    if (!isSpeler1 && !isSpeler2) { await interaction.reply({ content: '❌ Jij doet niet mee aan deze relatietest.', ephemeral: true }); return; }
    const speler = isSpeler1 ? sessie.speler1 : sessie.speler2;
    speler.antwoorden.push(actie === 'A' ? 'A' : 'B');
    if (speler.antwoorden.length >= game.RELATIE_VRAGEN.length) {
      await interaction.update({ content: '✅ Jouw antwoorden zijn opgeslagen! Wachten op de ander...', embeds: [], components: [] });
      if (sessie.speler1.antwoorden.length >= game.RELATIE_VRAGEN.length && sessie.speler2.antwoorden.length >= game.RELATIE_VRAGEN.length) {
        clearTimeout(sessie.timeout);
        game.relatieSpelers.delete(sessie.speler1.id);
        game.relatieSpelers.delete(sessie.speler2.id);
        game.relatieSessies.delete(sessionId);
        const achRelatie1 = game.voegPuntenToe(guildId, sessie.speler1.id, sessie.speler1.naam, 15);
        const achRelatie2 = game.voegPuntenToe(guildId, sessie.speler2.id, sessie.speler2.naam, 15);
        const rLove1 = stmts.insertAchievement.run(guildId, sessie.speler1.id, 'Lovebird');
        const rLove2 = stmts.insertAchievement.run(guildId, sessie.speler2.id, 'Lovebird');
        if (rLove1.changes > 0) achRelatie1.push('Lovebird');
        if (rLove2.changes > 0) achRelatie2.push('Lovebird');
        const kanaal = client.channels.cache.get(sessie.channelId);
        if (kanaal) {
          await kanaal.send({ embeds: [embeds.buildRelatieResultaatEmbed(sessie)] });
          for (const naam of achRelatie1) {
            const emoji = ACHIEVEMENT_EMOJIS[naam] ?? '🏆';
            await kanaal.send({ content: `${emoji} **Achievement behaald voor ${sessie.speler1.naam}:** ${naam}!` });
          }
          for (const naam of achRelatie2) {
            const emoji = ACHIEVEMENT_EMOJIS[naam] ?? '🏆';
            await kanaal.send({ content: `${emoji} **Achievement behaald voor ${sessie.speler2.naam}:** ${naam}!` });
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
      if (rZelfinzicht2.changes > 0) await interaction.followUp({ content: '🧠 **Achievement behaald:** Zelfinzicht!', ephemeral: true });
    } else {
      await interaction.update({ embeds: [embeds.buildLiefdestaalVraagEmbed(sessie.vraagIndex)], components: [embeds.buildLiefdestaalButtons()] });
    }
    return;
  }

  // ── Nieuwe ronde button ──

  if (interaction.customId === 'nieuwe_ronde') {
    let doelNaam = null;
    const b = game.getBeurten(guildId);
    if (b.lijst.length > 0) {
      doelNaam = game.advanceerBeurt(guildId).naam;
    }
    const achRonde = game.voegPuntenToe(guildId, interaction.user.id, user.displayName, 10);
    stmts.incrRondes.run(guildId, interaction.user.id);
    await interaction.update({ components: [] });
    await interaction.followUp({ embeds: [embeds.buildKiesEmbed(user, doelNaam)], components: [embeds.buildKiesButtons()] });
    await notifyAchievements(interaction, achRonde);
    return;
  }

  // ── Verwijder bevestiging buttons ──

  if (interaction.customId.startsWith('verwijder_ja_')) {
    const vraagId = parseInt(interaction.customId.replace('verwijder_ja_', ''));
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
        .setDescription(`Vraag verwijderd:\n\n> ${vraag.tekst}`)
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

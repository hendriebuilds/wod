import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('sessie')
  .setDescription('Beheer WoD-spelsessies — meerdere tegelijk mogelijk')
  .addSubcommand(sub => sub.setName('starten').setDescription('Start een nieuwe sessie in dit kanaal')
    .addStringOption(opt => opt.setName('naam').setDescription('Naam voor de sessie').setRequired(false)))
  .addSubcommand(sub => sub.setName('lijst').setDescription('Bekijk alle sessies op deze server'))
  .addSubcommand(sub => sub.setName('wisselen').setDescription('Activeer een andere sessie in dit kanaal')
    .addIntegerOption(opt => opt.setName('id').setDescription('Sessie ID (zie /sessie lijst)').setRequired(true)))
  .addSubcommand(sub => sub.setName('pauzeren').setDescription('Pauzeer de actieve sessie in dit kanaal'))
  .addSubcommand(sub => sub.setName('hervatten').setDescription('Hervat een gepauzeerde sessie')
    .addIntegerOption(opt => opt.setName('id').setDescription('Sessie ID (optioneel)').setRequired(false)))
  .addSubcommand(sub => sub.setName('stoppen').setDescription('Beëindig de actieve sessie definitief'))
  .addSubcommand(sub => sub.setName('info').setDescription('Toon info over de actieve sessie'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, { stmts, game }) {
  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();

  if (sub === 'starten') {
    const naam = interaction.options.getString('naam');
    const count = stmts.countSessies.get(guildId).cnt;
    const sessieNaam = naam?.trim() || `Sessie ${count + 1}`;
    const result = stmts.insertSessie.run(guildId, interaction.channelId, sessieNaam);
    const sessieId = result.lastInsertRowid;
    stmts.upsertActieveSessieLink.run(guildId, interaction.channelId, sessieId);
    game.laadSessieInCache(stmts.getSessieById.get(sessieId));
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('🎮 Nieuwe sessie gestart')
        .setDescription(`Sessie **${sessieNaam}** (ID: \`${sessieId}\`) is actief in dit kanaal.\nGebruik \`/wod\` om te beginnen!`).setTimestamp()],
    });
    return;
  }

  if (sub === 'lijst') {
    const sessies = stmts.getSessiesGuild.all(guildId);
    if (sessies.length === 0) {
      await interaction.reply({ content: 'Geen sessies gevonden. Gebruik `/wod` of `/sessie starten` om een sessie te beginnen.', ephemeral: true });
      return;
    }
    const link = stmts.getActieveSessieLink.get(guildId, interaction.channelId);
    const lines = sessies.map(s => {
      const emoji = s.status === 'actief' ? '🟢' : s.status === 'gepauzeerd' ? '🟡' : '🔴';
      const actief = (link && link.sessie_id === s.id) ? ' ◀ **actief**' : '';
      return `${emoji} \`#${s.id}\` **${s.naam}** — ${s.aantal_waarheid + s.aantal_doen} rondes (<#${s.channel_id}>)${actief}`;
    });
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('📋 Sessie-overzicht').setDescription(lines.join('\n')).setTimestamp()],
      ephemeral: true,
    });
    return;
  }

  if (sub === 'wisselen') {
    const id = interaction.options.getInteger('id');
    const sessie = stmts.getSessieById.get(id);
    if (!sessie || sessie.guild_id !== guildId) {
      await interaction.reply({ content: `❌ Sessie #${id} niet gevonden op deze server.`, ephemeral: true });
      return;
    }
    if (sessie.status === 'beeindigd') {
      await interaction.reply({ content: `❌ Sessie #${id} is al definitief beëindigd.`, ephemeral: true });
      return;
    }
    if (sessie.status === 'gepauzeerd') stmts.updateSessieStatus.run('actief', id);
    stmts.upsertActieveSessieLink.run(guildId, interaction.channelId, id);
    if (!game.sessieCache.has(id)) game.laadSessieInCache(stmts.getSessieById.get(id));
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('🔄 Sessie gewisseld')
        .setDescription(`Kanaal <#${interaction.channelId}> gebruikt nu sessie **${sessie.naam}** (ID: \`${id}\`).`)
        .addFields(
          { name: '🔵 Waarheid', value: `${sessie.aantal_waarheid}`, inline: true },
          { name: '🔴 Doen', value: `${sessie.aantal_doen}`, inline: true },
          { name: '🎮 Totaal', value: `${sessie.aantal_waarheid + sessie.aantal_doen}`, inline: true },
        ).setTimestamp()],
    });
    return;
  }

  if (sub === 'pauzeren') {
    const link = stmts.getActieveSessieLink.get(guildId, interaction.channelId);
    if (!link) {
      await interaction.reply({ content: '❌ Geen actieve sessie in dit kanaal.', ephemeral: true });
      return;
    }
    game.saveSessieCache(link.sessie_id);
    stmts.updateSessieStatus.run('gepauzeerd', link.sessie_id);
    stmts.deleteActieveSessieLink.run(guildId, interaction.channelId);
    const sessie = stmts.getSessieById.get(link.sessie_id);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('⏸️ Sessie gepauzeerd')
        .setDescription(`Sessie **${sessie.naam}** (ID: \`${link.sessie_id}\`) is gepauzeerd.\nGebruik \`/sessie hervatten ${link.sessie_id}\` om verder te gaan.`).setTimestamp()],
    });
    return;
  }

  if (sub === 'hervatten') {
    const id = interaction.options.getInteger('id');
    if (id) {
      const sessie = stmts.getSessieById.get(id);
      if (!sessie || sessie.guild_id !== guildId || sessie.status !== 'gepauzeerd') {
        await interaction.reply({ content: `❌ Geen gepauzeerde sessie met ID \`${id}\` gevonden.`, ephemeral: true });
        return;
      }
      stmts.updateSessieStatus.run('actief', id);
      stmts.upsertActieveSessieLink.run(guildId, interaction.channelId, id);
      if (!game.sessieCache.has(id)) game.laadSessieInCache(sessie);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('▶️ Sessie hervat')
          .setDescription(`Sessie **${sessie.naam}** (ID: \`${id}\`) is hervat in dit kanaal.`).setTimestamp()],
      });
    } else {
      const gepauzeerd = stmts.getSessiesGuild.all(guildId).filter(s => s.status === 'gepauzeerd');
      if (gepauzeerd.length === 0) {
        await interaction.reply({ content: 'Geen gepauzeerde sessies om te hervatten.', ephemeral: true });
        return;
      }
      const lines = gepauzeerd.map(s => `🟡 \`#${s.id}\` **${s.naam}** — ${s.aantal_waarheid + s.aantal_doen} rondes`);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('⏸️ Gepauzeerde sessies')
          .setDescription(lines.join('\n') + '\n\nGebruik `/sessie hervatten [id]` om te hervatten.').setTimestamp()],
        ephemeral: true,
      });
    }
    return;
  }

  if (sub === 'stoppen') {
    const link = stmts.getActieveSessieLink.get(guildId, interaction.channelId);
    if (!link) {
      await interaction.reply({ content: '❌ Geen actieve sessie in dit kanaal.', ephemeral: true });
      return;
    }
    game.saveSessieCache(link.sessie_id);
    stmts.updateSessieStatus.run('beeindigd', link.sessie_id);
    stmts.deleteActieveSessieLink.run(guildId, interaction.channelId);
    game.sessieCache.delete(link.sessie_id);
    const sessie = stmts.getSessieById.get(link.sessie_id);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('⏹️ Sessie beëindigd')
        .setDescription(`Sessie **${sessie.naam}** is definitief beëindigd.\n**${sessie.aantal_waarheid + sessie.aantal_doen}** rondes gespeeld.`).setTimestamp()],
    });
    return;
  }

  if (sub === 'info') {
    const link = stmts.getActieveSessieLink.get(guildId, interaction.channelId);
    if (!link) {
      await interaction.reply({ content: '❌ Geen actieve sessie in dit kanaal. Gebruik `/wod` of `/sessie starten` om te beginnen.', ephemeral: true });
      return;
    }
    const sessie = stmts.getSessieById.get(link.sessie_id);
    const cache = game.getSessieCache(link.sessie_id);
    const duur = Math.floor((new Date() - cache.sessieStart) / 60000);
    const uren = Math.floor(duur / 60);
    const minuten = duur % 60;
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle(`📊 ${sessie.naam}`)
        .addFields(
          { name: '🆔 Sessie ID', value: `${sessie.id}`, inline: true },
          { name: '📺 Kanaal', value: `<#${sessie.channel_id}>`, inline: true },
          { name: '⏱️ Duur', value: uren > 0 ? `${uren}u ${minuten}m` : `${minuten}m`, inline: true },
          { name: '🎮 Totaal', value: `${cache.aantalWaarheid + cache.aantalDoen}`, inline: true },
          { name: '🔵 Waarheid', value: `${cache.aantalWaarheid}`, inline: true },
          { name: '🔴 Doen', value: `${cache.aantalDoen}`, inline: true },
        ).setTimestamp()],
      ephemeral: true,
    });
  }
}

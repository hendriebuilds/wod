import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('reset')
  .setDescription('Reset de gebruikte vragen en statistieken voor een nieuwe avond. (Alleen voor admins)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, { stmts, game }) {
  const guildId = interaction.guildId;
  const link = stmts.getActieveSessieLink.get(guildId, interaction.channelId);
  if (link) {
    game.saveSessieCache(link.sessie_id);
    stmts.updateSessieStatus.run('beeindigd', link.sessie_id);
    stmts.deleteActieveSessieLink.run(guildId, interaction.channelId);
    game.sessieCache.delete(link.sessie_id);
  }
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Reset voltooid')
      .setDescription('Sessie beëindigd. Gebruik `/wod` of `/sessie starten` om een nieuwe sessie te beginnen. 🎉')
      .setTimestamp()],
  });
}

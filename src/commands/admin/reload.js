import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('Reset de gebruikte vragen voor deze server. (Alleen voor admins)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, { stmts, game }) {
  const guildId = interaction.guildId;
  const link = stmts.getActieveSessieLink.get(guildId, interaction.channelId);
  if (link) {
    const cache = game.getSessieCache(link.sessie_id);
    if (cache) {
      cache.gebruikteWaarheid.clear();
      cache.gebruikteDoen.clear();
      game.saveSessieCache(link.sessie_id);
    }
  }
  const waarheidCount = stmts.countVragen.get(guildId, 'waarheid').cnt;
  const doenCount = stmts.countVragen.get(guildId, 'doen').cnt;
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Vragen gereset')
      .setDescription(`Gebruikte vragen gereset.\n\n📋 **${waarheidCount}** waarheidsvragen\n🎯 **${doenCount}** doe-opdrachten`)
      .setTimestamp()],
    ephemeral: true,
  });
}

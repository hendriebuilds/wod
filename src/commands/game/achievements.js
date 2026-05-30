import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('achievements')
  .setDescription('Bekijk jouw behaalde achievements.');

export async function execute(interaction, { stmts, embeds }) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const user = interaction.member ?? interaction.user;
  const userNaam = user.displayName ?? interaction.user.username;
  const behaald = stmts.getUserAchievements.all(guildId, userId);
  await interaction.reply({ embeds: [embeds.buildAchievementsEmbed(guildId, userId, userNaam, behaald)], ephemeral: true });
}

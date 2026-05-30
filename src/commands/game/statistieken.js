import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('statistieken')
  .setDescription('Bekijk de statistieken van deze sessie.');

export async function execute(interaction, { embeds }) {
  await interaction.reply({ embeds: [embeds.buildStatistiekenEmbed(interaction.guildId, interaction.channelId)] });
}

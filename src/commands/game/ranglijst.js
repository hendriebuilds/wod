import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ranglijst')
  .setDescription('Bekijk de top 10 van deze server.');

export async function execute(interaction, { stmts, embeds }) {
  const rows = stmts.getRanglijst.all(interaction.guildId);
  await interaction.reply({ embeds: [embeds.buildRanglijstEmbed(rows)] });
}

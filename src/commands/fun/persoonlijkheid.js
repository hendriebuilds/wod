import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('persoonlijkheid')
  .setDescription('Doe een korte persoonlijkheidstest en ontdek jouw type!');

export async function execute(interaction, { game, embeds }) {
  const userId = interaction.user.id;
  if (game.persoonlijkheidSessies.has(userId)) {
    await interaction.reply({ content: '❌ Je bent al bezig met een persoonlijkheidstest!', ephemeral: true });
    return;
  }
  const timeout = setTimeout(() => game.persoonlijkheidSessies.delete(userId), 10 * 60 * 1000);
  game.persoonlijkheidSessies.set(userId, { channelId: interaction.channelId, antwoorden: [], vraagIndex: 0, timeout });
  await interaction.reply({ embeds: [embeds.buildPersoonlijkheidVraagEmbed(0)], components: [embeds.buildPersoonlijkheidButtons()], ephemeral: true });
}

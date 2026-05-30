import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('liefdestaal')
  .setDescription('Doe een korte liefdestaaltest en ontdek jouw liefdestaal!');

export async function execute(interaction, { game, embeds }) {
  const userId = interaction.user.id;
  if (game.liefdestaalSessies.has(userId)) {
    await interaction.reply({ content: '❌ Je bent al bezig met een liefdestaaltest! Beantwoord de openstaande vraag eerst.', ephemeral: true });
    return;
  }
  const timeout = setTimeout(() => game.liefdestaalSessies.delete(userId), 10 * 60 * 1000);
  game.liefdestaalSessies.set(userId, { channelId: interaction.channelId, antwoorden: [], vraagIndex: 0, timeout });
  await interaction.reply({ embeds: [embeds.buildLiefdestaalVraagEmbed(0)], components: [embeds.buildLiefdestaalButtons()], ephemeral: true });
}

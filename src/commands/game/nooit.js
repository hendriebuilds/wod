import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getRandomNooit } from '../../database.js';
import { MAX_LENGTE } from '../../game.js';

export const data = new SlashCommandBuilder()
  .setName('nooit')
  .setDescription("Doe een ronde 'Nooit heb ik...' met de groep!")
  .addStringOption(opt =>
    opt.setName('stelling').setDescription('De stelling (optioneel, anders kiest de bot er een)').setRequired(false)
      .setMaxLength(MAX_LENGTE.stelling)
  );

export async function execute(interaction, { game, embeds }) {
  const invoer = interaction.options.getString('stelling');
  if (invoer && invoer.trim().length > MAX_LENGTE.stelling) {
    await interaction.reply({ content: `❌ Een stelling mag maximaal ${MAX_LENGTE.stelling} tekens zijn.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const stelling = invoer?.trim() || getRandomNooit(interaction.guildId);
  const sessionId = interaction.id;
  const timeout = setTimeout(() => game.nooitStemmen.delete(sessionId), 2 * 60 * 60 * 1000);
  game.nooitStemmen.set(sessionId, { stelling, wel: new Map(), nooit: new Map(), beloond: new Set(), timeout });
  await interaction.reply({
    embeds: [embeds.buildNooitEmbed(stelling, new Map(), new Map())],
    components: [embeds.buildNooitButtons(sessionId, 0, 0)],
  });
}

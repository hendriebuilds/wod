import { SlashCommandBuilder } from 'discord.js';
import { stuurVraag } from '../../ronde.js';

export const data = new SlashCommandBuilder()
  .setName('doen')
  .setDescription('Krijg direct een doe-opdracht.')
  .addIntegerOption(opt =>
    opt.setName('nummer').setDescription('Optioneel: vraag een specifieke opdracht op via nummer (zie /lijst).').setRequired(false).setMinValue(1)
  );

export async function execute(interaction, { stmts, game }) {
  const guildId = interaction.guildId;
  const speler = { id: interaction.user.id, naam: interaction.member?.displayName ?? interaction.user.username };
  const nummer = interaction.options.getInteger('nummer');

  let vraag = null;
  if (nummer !== null) {
    const vragen = stmts.getVragen.all(guildId, 'doen');
    if (nummer > vragen.length) {
      await interaction.reply({ content: `❌ Er is geen doe-opdracht met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
      return;
    }
    vraag = vragen[nummer - 1];
    const sessieId = game.getSessieId(guildId, interaction.channelId);
    game.getSessieCache(sessieId).gebruikteDoen.add(vraag.id);
    game.saveSessieCache(sessieId);
  }

  await stuurVraag(interaction, { type: 'doen', speler, variant: 'normaal', vraag, via: 'reply' });
}

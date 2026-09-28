import { SlashCommandBuilder } from 'discord.js';
import { stuurVraag } from '../../ronde.js';

export const data = new SlashCommandBuilder()
  .setName('waarheid')
  .setDescription('Krijg direct een waarheidsvraag.')
  .addIntegerOption(opt =>
    opt.setName('nummer').setDescription('Optioneel: vraag een specifieke vraag op via nummer (zie /lijst).').setRequired(false).setMinValue(1)
  );

export async function execute(interaction, { stmts, game }) {
  const guildId = interaction.guildId;
  const speler = { id: interaction.user.id, naam: interaction.member?.displayName ?? interaction.user.username };
  const nummer = interaction.options.getInteger('nummer');

  let vraag = null;
  if (nummer !== null) {
    const vragen = stmts.getVragen.all(guildId, 'waarheid');
    if (nummer > vragen.length) {
      await interaction.reply({ content: `❌ Er is geen waarheidsvraag met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
      return;
    }
    vraag = vragen[nummer - 1];
    const catFilter = game.getCategorieFilter(guildId, interaction.channelId);
    if (catFilter && vraag.categorie !== catFilter) {
      await interaction.reply({
        content: `❌ Vraag ${nummer} hoort bij ${game.categorieLabel(vraag.categorie)}. In dit kanaal kunnen alleen vragen uit ${game.categorieLabel(catFilter)}.`,
        ephemeral: true,
      });
      return;
    }
    const sessieId = game.getSessieId(guildId, interaction.channelId);
    game.getSessieCache(sessieId).gebruikteWaarheid.add(vraag.id);
    game.saveSessieCache(sessieId);
  }

  await stuurVraag(interaction, { type: 'waarheid', speler, variant: 'normaal', vraag, via: 'reply' });
}

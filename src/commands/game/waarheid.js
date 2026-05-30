import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('waarheid')
  .setDescription('Krijg direct een waarheidsvraag.')
  .addIntegerOption(opt =>
    opt.setName('nummer').setDescription('Optioneel: vraag een specifieke vraag op via nummer (zie /lijst).').setRequired(false).setMinValue(1)
  );

export async function execute(interaction, { stmts, game, embeds }) {
  const guildId = interaction.guildId;
  const user = interaction.member ?? interaction.user;
  const nummer = interaction.options.getInteger('nummer');
  const sessieId = game.getSessieId(guildId, interaction.channelId);

  if (nummer !== null) {
    const vragen = stmts.getVragen.all(guildId, 'waarheid');
    if (nummer > vragen.length) {
      await interaction.reply({ content: `❌ Er is geen waarheidsvraag met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
      return;
    }
    const vraag = vragen[nummer - 1];
    const cache = game.getSessieCache(sessieId);
    cache.gebruikteWaarheid.add(vraag.id);
    cache.aantalWaarheid++;
    game.saveSessieCache(sessieId);
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || vraag.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)] });
        await interaction.reply({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('waarheid')] });
      } catch {
        await interaction.reply({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
      }
    } else {
      await interaction.reply({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
    }
  } else {
    const catFilter = game.getCategorieFilter(guildId, interaction.channelId);
    const vraag = game.getVraag(guildId, 'waarheid', catFilter, sessieId);
    if (!vraag) {
      await interaction.reply({ content: '❌ Er zijn geen waarheidsvragen. Voeg ze toe via het admin panel.', ephemeral: true });
      return;
    }
    const cache = game.getSessieCache(sessieId);
    cache.aantalWaarheid++;
    game.saveSessieCache(sessieId);
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || vraag.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)] });
        await interaction.reply({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('waarheid')] });
      } catch {
        await interaction.reply({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
      }
    } else {
      await interaction.reply({ embeds: [embeds.buildWaarheidEmbed(vraag.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('waarheid')] });
    }
  }
}

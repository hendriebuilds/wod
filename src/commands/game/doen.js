import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('doen')
  .setDescription('Krijg direct een doe-opdracht.')
  .addIntegerOption(opt =>
    opt.setName('nummer').setDescription('Optioneel: vraag een specifieke opdracht op via nummer (zie /lijst).').setRequired(false).setMinValue(1)
  );

export async function execute(interaction, { stmts, game, embeds }) {
  const guildId = interaction.guildId;
  const user = interaction.member ?? interaction.user;
  const nummer = interaction.options.getInteger('nummer');
  const sessieId = game.getSessieId(guildId, interaction.channelId);

  if (nummer !== null) {
    const opdrachten = stmts.getVragen.all(guildId, 'doen');
    if (nummer > opdrachten.length) {
      await interaction.reply({ content: `❌ Er is geen doe-opdracht met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
      return;
    }
    const opdracht = opdrachten[nummer - 1];
    const cache = game.getSessieCache(sessieId);
    cache.gebruikteDoen.add(opdracht.id);
    cache.aantalDoen++;
    game.saveSessieCache(sessieId);
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || opdracht.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)] });
        await interaction.reply({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('doen')] });
      } catch {
        await interaction.reply({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('doen')] });
      }
    } else {
      await interaction.reply({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('doen')] });
    }
  } else {
    const catFilter = game.getCategorieFilter(guildId, interaction.channelId);
    const opdracht = game.getVraag(guildId, 'doen', catFilter, sessieId);
    if (!opdracht) {
      await interaction.reply({ content: '❌ Er zijn geen doe-opdrachten. Voeg ze toe via het admin panel.', ephemeral: true });
      return;
    }
    const cache = game.getSessieCache(sessieId);
    cache.aantalDoen++;
    game.saveSessieCache(sessieId);
    const inst = game.dbGetInstellingen(guildId);
    if (inst.dmModus || opdracht.dm_modus) {
      try {
        await interaction.user.send({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)] });
        await interaction.reply({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [embeds.buildActieButtons('doen')] });
      } catch {
        await interaction.reply({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('doen')] });
      }
    } else {
      await interaction.reply({ embeds: [embeds.buildDoenEmbed(opdracht.tekst, user, guildId, false, sessieId)], components: [embeds.buildActieButtons('doen')] });
    }
  }
}

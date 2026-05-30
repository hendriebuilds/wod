import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('wod')
  .setDescription('Start een ronde Waarheid of Doen!')
  .addUserOption(opt =>
    opt.setName('speler').setDescription('Richt de vraag op een specifieke speler.').setRequired(false)
  );

export async function execute(interaction, { game, embeds }) {
  const doelLid = interaction.options.getMember('speler');
  let doelNaam = null;
  if (doelLid) {
    doelNaam = doelLid.displayName;
  } else {
    doelNaam = game.getHuidigeSpelerNaam(interaction.guildId);
  }
  await interaction.reply({ embeds: [embeds.buildKiesEmbed(interaction.member ?? interaction.user, doelNaam)], components: [embeds.buildKiesButtons()] });
}

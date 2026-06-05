import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('wod')
  .setDescription('Start een ronde Waarheid of Doen!')
  .addUserOption(opt =>
    opt.setName('speler').setDescription('Richt de vraag op een specifieke speler.').setRequired(false)
  );

export async function execute(interaction, { game, embeds }) {
  const user = interaction.member ?? interaction.user;
  const doelLid = interaction.options.getMember('speler');
  let doelNaam = null;
  if (doelLid) {
    doelNaam = doelLid.displayName;
  } else {
    doelNaam = game.getHuidigeSpelerNaam(interaction.guildId);
  }
  const { levelVoor, levelNa, levelInfo } = game.voegPuntenToe(interaction.guildId, interaction.user.id, user.displayName, 5);
  await interaction.reply({ embeds: [embeds.buildKiesEmbed(user, doelNaam)], components: [embeds.buildKiesButtons()] });
  if (levelNa > levelVoor) {
    try {
      await interaction.channel.send({ embeds: [embeds.buildLevelUpEmbed(user, levelInfo)] });
    } catch (err) {
      console.error('Level-up notificatie mislukt:', err);
    }
  }
}

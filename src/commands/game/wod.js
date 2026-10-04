import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('wod')
  .setDescription('Start een ronde Waarheid of Doen!')
  .addUserOption(opt =>
    opt.setName('speler').setDescription('Richt de vraag op een specifieke speler.').setRequired(false)
  );

export async function execute(interaction, { game, embeds }) {
  // Speler van de ronde: optie speler, anders de rotatie, anders jijzelf. Geen punten bij /wod.
  const doelUser = interaction.options.getUser('speler');
  let speler;
  if (doelUser) {
    if (doelUser.bot) {
      await interaction.reply({ content: '❌ Een bot kan geen Waarheid of Doen spelen.', flags: MessageFlags.Ephemeral });
      return;
    }
    const doelLid = interaction.options.getMember('speler');
    speler = { id: doelUser.id, naam: doelLid?.displayName ?? doelUser.username };
  } else {
    speler = game.getHuidigeSpeler(interaction.guildId)
      ?? { id: interaction.user.id, naam: interaction.member?.displayName ?? interaction.user.username };
  }
  await interaction.reply({
    embeds: [embeds.buildKiesEmbed({ spelerNaam: speler.naam })],
    components: [embeds.buildKiesButtons(speler.id)],
  });
}

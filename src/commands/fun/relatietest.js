import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('relatietest')
  .setDescription('Test hoe goed jij en een andere speler bij elkaar passen!')
  .addUserOption(opt =>
    opt.setName('speler').setDescription('De speler waarmee je de test doet').setRequired(true)
  );

export async function execute(interaction, { game, embeds }) {
  const userId = interaction.user.id;
  const user = interaction.member ?? interaction.user;
  const targetUser = interaction.options.getUser('speler');
  const targetLid = interaction.options.getMember('speler');

  if (targetUser.id === userId) {
    await interaction.reply({ content: '❌ Je kunt geen relatietest doen met jezelf!', ephemeral: true });
    return;
  }
  if (targetUser.bot) {
    await interaction.reply({ content: '❌ Je kunt geen relatietest doen met een bot!', ephemeral: true });
    return;
  }
  if (game.relatieSpelers.has(userId) || game.relatieSpelers.has(targetUser.id)) {
    await interaction.reply({ content: '❌ Eén van jullie doet al mee aan een relatietest.', ephemeral: true });
    return;
  }

  const sessionId = interaction.id;
  const initiatorNaam = user.displayName ?? interaction.user.username;
  const targetNaam = targetLid?.displayName ?? targetUser.username;
  const timeout = setTimeout(() => {
    const s = game.relatieSessies.get(sessionId);
    if (s) { game.relatieSpelers.delete(s.speler1.id); game.relatieSpelers.delete(s.speler2.id); }
    game.relatieSessies.delete(sessionId);
  }, 15 * 60 * 1000);

  game.relatieSessies.set(sessionId, {
    channelId: interaction.channelId,
    speler1: { id: userId, naam: initiatorNaam, antwoorden: [] },
    speler2: { id: targetUser.id, naam: targetNaam, antwoorden: [] },
    timeout,
  });
  game.relatieSpelers.set(userId, sessionId);
  game.relatieSpelers.set(targetUser.id, sessionId);

  await interaction.reply({ embeds: [embeds.buildRelatieVraagEmbed(0, initiatorNaam)], components: [embeds.buildRelatieButtons(sessionId)], ephemeral: true });
  await interaction.followUp({
    embeds: [new EmbedBuilder()
      .setColor(0xeb459e)
      .setTitle('💑 Relatietest uitdaging!')
      .setDescription(`**${initiatorNaam}** daagt **${targetNaam}** uit voor een relatietest!\n\n<@${targetUser.id}>, klik op de knop om jouw vragen te beantwoorden.`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rt_start_${sessionId}`).setLabel('▶️ Start mijn test').setStyle(ButtonStyle.Primary)
    )],
  });
}

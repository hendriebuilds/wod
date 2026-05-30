import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('profiel')
  .setDescription('Bekijk jouw profiel of dat van een andere speler.')
  .addUserOption(opt =>
    opt.setName('speler').setDescription('Optioneel: bekijk het profiel van een andere speler.').setRequired(false)
  );

export async function execute(interaction, { stmts, embeds }) {
  const guildId = interaction.guildId;
  const targetUser = interaction.options.getUser('speler') ?? interaction.user;
  const targetLid = interaction.options.getMember('speler') ?? (interaction.member ?? interaction.user);
  const userId = targetUser.id;
  const userNaam = targetLid?.displayName ?? targetUser.username;

  let row = stmts.getUserLevel.get(guildId, userId);
  if (!row) {
    row = { user_naam: userNaam, punten: 0, level: 1, reroll_teller: 0, passen_teller: 0, rondes_teller: 0 };
  }
  const achievements = stmts.getUserAchievements.all(guildId, userId);

  await interaction.reply({ embeds: [embeds.buildProfielEmbed(row, achievements, targetUser)], ephemeral: false });
}

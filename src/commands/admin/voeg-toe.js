import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('voeg-toe')
  .setDescription('Voeg een nieuwe vraag of opdracht toe. (Alleen voor admins)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(opt =>
    opt.setName('type').setDescription('Waarheid of doen?').setRequired(true)
      .addChoices({ name: 'Waarheid', value: 'waarheid' }, { name: 'Doen', value: 'doen' })
  )
  .addStringOption(opt =>
    opt.setName('tekst').setDescription('De tekst van de vraag of opdracht.').setRequired(true)
  );

export async function execute(interaction, { stmts }) {
  const guildId = interaction.guildId;
  const type = interaction.options.getString('type');
  const tekst = interaction.options.getString('tekst').trim();
  stmts.insertVraag.run(guildId, type, tekst, 'algemeen', 0);
  const count = stmts.countVragen.get(guildId, type).cnt;
  const label = type === 'waarheid' ? 'waarheidsvraag' : 'doe-opdracht';
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Toegevoegd')
      .setDescription(`Nieuwe ${label} toegevoegd als #${count}:\n\n> ${tekst}`)
      .setTimestamp()],
    ephemeral: true,
  });
}

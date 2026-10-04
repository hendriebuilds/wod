import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { CATEGORIEEN, categorieLabel, isGeldigeCategorie } from '../../game.js';

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
  )
  .addStringOption(opt =>
    opt.setName('categorie').setDescription('In welke categorie?').setRequired(true)
      .addChoices(...Object.entries(CATEGORIEEN).map(([value, c]) => ({ name: `${c.emoji} ${c.naam}`, value })))
  );

export async function execute(interaction, { stmts }) {
  const guildId = interaction.guildId;
  const type = interaction.options.getString('type');
  const tekst = interaction.options.getString('tekst').trim();
  const categorie = interaction.options.getString('categorie');
  if (!['waarheid', 'doen'].includes(type) || !tekst || !isGeldigeCategorie(categorie)) {
    return interaction.reply({ content: '❌ Ongeldig type, lege tekst of onbekende categorie.', ephemeral: true });
  }
  const result = stmts.insertVraag.run(guildId, type, tekst, categorie, 0);
  if (result.changes === 0) {
    return interaction.reply({
      content: '⚠️ Deze vraag bestaat al in deze server (of een identieke variant).',
      ephemeral: true,
    });
  }
  const count = stmts.countVragen.get(guildId, type).cnt;
  const label = type === 'waarheid' ? 'waarheidsvraag' : 'doe-opdracht';
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Toegevoegd')
      .setDescription(`Nieuwe ${label} toegevoegd als #${count} in ${categorieLabel(categorie)}:\n\n> ${tekst}`)
      .setTimestamp()],
    ephemeral: true,
  });
}

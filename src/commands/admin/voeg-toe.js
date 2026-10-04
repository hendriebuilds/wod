import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { CATEGORIEEN, categorieLabel, isGeldigeCategorie, MAX_LENGTE } from '../../game.js';
import { kapAf, LIMIET } from '../../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('voeg-toe')
  .setDescription('Voeg een nieuwe vraag of opdracht toe. (Alleen voor admins)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(opt =>
    opt.setName('type').setDescription('Waarheid of doen?').setRequired(true)
      .addChoices({ name: 'Waarheid', value: 'waarheid' }, { name: 'Doen', value: 'doen' })
  )
  .addStringOption(opt =>
    opt.setName('tekst').setDescription('De tekst van de vraag of opdracht.').setRequired(true).setMaxLength(MAX_LENGTE.vraag)
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
    return interaction.reply({ content: '❌ Ongeldig type, lege tekst of onbekende categorie.', flags: MessageFlags.Ephemeral });
  }
  if (tekst.length > MAX_LENGTE.vraag) {
    return interaction.reply({ content: `❌ Een vraag mag maximaal ${MAX_LENGTE.vraag} tekens zijn.`, flags: MessageFlags.Ephemeral });
  }
  const result = stmts.insertVraag.run(guildId, type, tekst, categorie, 0);
  if (result.changes === 0) {
    return interaction.reply({
      content: '⚠️ Deze vraag bestaat al in deze server (of een identieke variant).',
      flags: MessageFlags.Ephemeral,
    });
  }
  const count = stmts.countVragen.get(guildId, type).cnt;
  const label = type === 'waarheid' ? 'waarheidsvraag' : 'doe-opdracht';
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Toegevoegd')
      .setDescription(kapAf(`Nieuwe ${label} toegevoegd als #${count} in ${categorieLabel(categorie)}:\n\n> ${tekst}`, LIMIET.beschrijving))
      .setTimestamp()],
    flags: MessageFlags.Ephemeral,
  });
}

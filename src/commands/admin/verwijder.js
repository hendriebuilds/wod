import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('verwijder')
  .setDescription('Verwijder een vraag of opdracht. (Alleen voor admins)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(opt =>
    opt.setName('type').setDescription('Waarheid of doen?').setRequired(true)
      .addChoices({ name: 'Waarheid', value: 'waarheid' }, { name: 'Doen', value: 'doen' })
  )
  .addIntegerOption(opt =>
    opt.setName('nummer').setDescription('Het nummer van de vraag (gebruik /lijst om nummers te zien).').setRequired(true).setMinValue(1)
  );

export async function execute(interaction, { stmts }) {
  const guildId = interaction.guildId;
  const type = interaction.options.getString('type');
  const nummer = interaction.options.getInteger('nummer');
  const vragen = stmts.getVragen.all(guildId, type);
  const label = type === 'waarheid' ? 'waarheidsvraag' : 'doe-opdracht';
  if (nummer > vragen.length) {
    await interaction.reply({
      content: `❌ Er is geen ${label} met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`,
      ephemeral: true,
    });
    return;
  }
  const vraag = vragen[nummer - 1];
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle('⚠️ Bevestig verwijdering')
      .setDescription(`Weet je zeker dat je ${label} #${nummer} wilt verwijderen?\n\n> ${vraag.tekst}`)
      .setTimestamp()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`verwijder_ja_${vraag.id}`).setLabel('🗑️ Ja, verwijder').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('verwijder_nee').setLabel('❌ Annuleer').setStyle(ButtonStyle.Secondary)
    )],
    ephemeral: true,
  });
}

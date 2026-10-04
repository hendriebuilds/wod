import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('strafpunten')
  .setDescription('Trek punten af van een speler als straf. (Alleen voor admins)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption(o => o.setName('speler').setDescription('Wie krijgt de straf?').setRequired(true))
  .addIntegerOption(o => o.setName('aantal').setDescription('Aantal punten (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
  .addStringOption(o => o.setName('reden').setDescription('Waarom?').setRequired(true).setMaxLength(200));

export async function execute(interaction, { stmts, game, embeds }) {
  const guildId = interaction.guildId;
  const speler = interaction.options.getUser('speler');
  const aantal = interaction.options.getInteger('aantal');
  const reden = (interaction.options.getString('reden') ?? '').trim();

  if (speler.bot) {
    await interaction.reply({ content: '❌ Bots hebben geen punten.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!Number.isInteger(aantal) || aantal < 1 || aantal > 100) {
    await interaction.reply({ content: '❌ Het aantal moet tussen 1 en 100 liggen.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!reden) {
    await interaction.reply({ content: '❌ Geef een reden op.', flags: MessageFlags.Ephemeral });
    return;
  }

  const spelerNaam = interaction.options.getMember('speler')?.displayName ?? speler.globalName ?? speler.username;
  const doorNaam = interaction.member?.displayName ?? interaction.user.username;

  // Een level omlaag geeft geen melding (zoals bij reroll en passen).
  const { effectiefDelta, puntenNa } = game.voegPuntenToe(guildId, speler.id, spelerNaam, -aantal);
  const afgetrokken = -effectiefDelta;
  stmts.insertStrafpunten.run(guildId, speler.id, interaction.user.id, afgetrokken, reden.slice(0, 200));

  await interaction.reply({
    embeds: [embeds.buildStrafpuntenEmbed({ spelerNaam, aantal: afgetrokken, gevraagd: aantal, reden, doorNaam, puntenNa })],
    allowedMentions: { parse: [] },
  });
}

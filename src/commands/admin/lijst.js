import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('lijst')
  .setDescription('Bekijk alle huidige vragen en opdrachten. (Alleen voor admins)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(opt =>
    opt.setName('type').setDescription('Waarheid, doen, of allebei?').setRequired(false)
      .addChoices({ name: 'Waarheid', value: 'waarheid' }, { name: 'Doen', value: 'doen' })
  );

export async function execute(interaction, { embeds }) {
  const type = interaction.options.getString('type');
  if (!type) {
    const alleEmbeds = [...embeds.buildLijstEmbeds(interaction.guildId, 'waarheid'), ...embeds.buildLijstEmbeds(interaction.guildId, 'doen')].slice(0, 10);
    await interaction.reply({ embeds: alleEmbeds, ephemeral: true });
  } else {
    await interaction.reply({ embeds: embeds.buildLijstEmbeds(interaction.guildId, type), ephemeral: true });
  }
}

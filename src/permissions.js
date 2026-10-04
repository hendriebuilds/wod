import { PermissionFlagsBits, MessageFlags } from 'discord.js';

export function isGuildAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export const GEEN_RECHTEN = { content: '🔒 Dit mag alleen een admin (Server beheren).', flags: MessageFlags.Ephemeral };

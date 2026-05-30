import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('beurt')
  .setDescription('Beheer de beurtrotatie.')
  .addSubcommand(sub => sub.setName('toevoegen').setDescription('Voeg een speler toe aan de rotatie.').addUserOption(opt => opt.setName('speler').setDescription('De toe te voegen speler.').setRequired(true)))
  .addSubcommand(sub => sub.setName('verwijder').setDescription('Verwijder een speler uit de rotatie.').addUserOption(opt => opt.setName('speler').setDescription('De te verwijderen speler.').setRequired(true)))
  .addSubcommand(sub => sub.setName('lijst').setDescription('Bekijk de huidige rotatie.'))
  .addSubcommand(sub => sub.setName('reset').setDescription('Wis de rotatie.'))
  .addSubcommand(sub => sub.setName('volgende').setDescription('Sla de huidige speler over en ga naar de volgende.'));

export async function execute(interaction, { game }) {
  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  const b = game.getBeurten(guildId);

  if (sub === 'toevoegen') {
    const doelUser = interaction.options.getUser('speler');
    const doelLid = interaction.options.getMember('speler');
    const naam = doelLid?.displayName ?? doelUser.username;
    if (b.lijst.some(s => s.id === doelUser.id)) {
      await interaction.reply({ content: `**${naam}** staat al in de rotatie.`, ephemeral: true });
      return;
    }
    b.lijst.push({ id: doelUser.id, naam });
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('✅ Speler toegevoegd')
        .setDescription(`**${naam}** is toegevoegd aan de rotatie.\n\n${game.buildBeurtenLijstTekst(guildId)}`).setTimestamp()],
    });
    return;
  }

  if (sub === 'verwijder') {
    const doelUser = interaction.options.getUser('speler');
    const idx = b.lijst.findIndex(s => s.id === doelUser.id);
    if (idx === -1) {
      await interaction.reply({ content: 'Die speler staat niet in de rotatie.', ephemeral: true });
      return;
    }
    const verwijderd = b.lijst.splice(idx, 1)[0];
    if (b.huidig >= b.lijst.length) b.huidig = 0;
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('✅ Speler verwijderd')
        .setDescription(`**${verwijderd.naam}** is verwijderd uit de rotatie.${b.lijst.length > 0 ? `\n\n${game.buildBeurtenLijstTekst(guildId)}` : ''}`).setTimestamp()],
    });
    return;
  }

  if (sub === 'lijst') {
    if (b.lijst.length === 0) {
      await interaction.reply({ content: 'De rotatie is leeg. Voeg spelers toe met `/beurt toevoegen`.', ephemeral: true });
      return;
    }
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('🔄 Beurtrotatie').setDescription(game.buildBeurtenLijstTekst(guildId)).setTimestamp()],
    });
    return;
  }

  if (sub === 'reset') {
    b.lijst.length = 0;
    b.huidig = 0;
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('✅ Rotatie gewist').setDescription('De beurtrotatie is gewist.').setTimestamp()],
    });
    return;
  }

  if (sub === 'volgende') {
    if (b.lijst.length === 0) {
      await interaction.reply({ content: 'De rotatie is leeg.', ephemeral: true });
      return;
    }
    const volgende = game.advanceerBeurt(guildId);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('🔄 Volgende speler')
        .setDescription(`Het is nu **${volgende.naam}**'s beurt!\n\n${game.buildBeurtenLijstTekst(guildId)}`).setTimestamp()],
    });
  }
}

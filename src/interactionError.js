export async function replyError(interaction, err, label) {
  console.error(`❌ Fout in ${label} (guild ${interaction.guildId ?? '-'}):`, err);
  if (!interaction.isRepliable()) return;
  const payload = { content: '❌ Er ging iets mis. Probeer het nog eens.', ephemeral: true };
  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (e) {
    console.error('❌ Foutmelding sturen mislukt:', e.message);
  }
}

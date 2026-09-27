const VERPLICHT = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'SESSION_SECRET'];
const ontbreekt = VERPLICHT.filter(k => !process.env[k]?.trim());
if (ontbreekt.length) {
  console.error(`❌ Ontbrekende omgevingsvariabelen: ${ontbreekt.join(', ')}. De bot stopt.`);
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error('❌ SESSION_SECRET moet minimaal 32 tekens lang zijn. Genereer er een met: openssl rand -hex 32');
  process.exit(1);
}

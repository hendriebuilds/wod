import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import * as dotenv from 'dotenv';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { db, stmts, syncGuildToDb, migreerVanJSON } from './src/database.js';
import * as game from './src/game.js';
import * as embeds from './src/embeds.js';
import { handleButton } from './src/buttons.js';
import { setClient, startServer } from './src/server.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

setClient(client);

// ─── Command loader ────────────────────────────────────────────────────────────

const commandMap = new Map();
const categories = ['game', 'fun', 'admin'];
for (const cat of categories) {
  const dir = join(__dirname, 'src', 'commands', cat);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const mod = await import(join(dir, file));
    commandMap.set(mod.data.name, mod);
  }
}

const ctx = { client, db, stmts, game, embeds };

// ─── Events ────────────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`✅ Ingelogd als ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commandBody = [...commandMap.values()].map(m => m.data.toJSON());

  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandBody });
    console.log('✅ Globale slash commands geregistreerd!');
  } catch (err) {
    console.error('❌ Fout bij registreren van globale commands:', err.message);
  }

  for (const [guildId] of client.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: [] });
    } catch {
      // stilletjes negeren
    }
  }

  for (const [, guild] of client.guilds.cache) syncGuildToDb(guild);
  console.log(`✅ ${client.guilds.cache.size} server(s) gesynchroniseerd.`);

  migreerVanJSON([...client.guilds.cache.keys()]);
});

client.on('guildCreate', (guild) => {
  console.log(`📥 Bot toegevoegd aan: ${guild.name} (${guild.id})`);
  syncGuildToDb(guild);
});

client.on('guildDelete', (guild) => {
  console.log(`📤 Bot verwijderd van: ${guild.name} (${guild.id})`);
  stmts.deleteBotServer.run(guild.id);
});

client.on('guildUpdate', (_old, newGuild) => {
  syncGuildToDb(newGuild);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.guildId) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: '❌ Deze bot werkt alleen in servers.', ephemeral: true });
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    const mod = commandMap.get(interaction.commandName);
    if (mod) await mod.execute(interaction, ctx);
    return;
  }

  if (interaction.isButton()) {
    await handleButton(interaction, ctx);
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

startServer();
client.login(process.env.DISCORD_TOKEN);

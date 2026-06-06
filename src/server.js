import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ChannelType } from 'discord.js';
import { db, stmts, dbGetInstellingen } from './database.js';
import { sessieCache, getSessieCache, saveSessieCache } from './game.js';
import { config, slaConfigOp, isSuperAdmin } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _client = null;
export function setClient(client) { _client = client; }

const app = express();
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || '3001');
const DISCORD_API = 'https://discord.com/api/v10';

app.use(cors({ origin: (_, cb) => cb(null, config.frontendUrl), credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme-zet-een-echt-secret-in-.env',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Niet ingelogd' });
  next();
}

function requireGuild(req, res, next) {
  if (!req.session.activeGuildId) return res.status(400).json({ error: 'Geen server geselecteerd.' });
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Niet ingelogd' });
  if (!isSuperAdmin(req.session.user.id)) return res.status(403).json({ error: 'Geen superadmin-rechten.' });
  next();
}

// ── Auth ──

app.get('/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'identify guilds',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Geen code ontvangen.');
  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Geen access token ontvangen.');

    const [userRes, guildsRes] = await Promise.all([
      fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
      fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
    ]);
    const userData = await userRes.json();
    const guildsData = await guildsRes.json();

    const botGuildIds = new Set(_client.guilds.cache.keys());
    let adminGuilds;

    if (isSuperAdmin(userData.id)) {
      adminGuilds = [..._client.guilds.cache.values()].map(g => ({
        id: g.id, name: g.name, icon: g.icon ?? null,
      })).sort((a, b) => a.name.localeCompare(b.name));
    } else {
      adminGuilds = guildsData
        .filter(g => botGuildIds.has(g.id) && (BigInt(g.permissions) & 0x20n) !== 0n)
        .map(g => ({ id: g.id, name: g.name, icon: g.icon }));
    }

    if (adminGuilds.length === 0) return res.redirect(`${config.frontendUrl}?error=geen_toegang`);

    req.session.user = {
      id: userData.id,
      username: userData.username,
      avatar: userData.avatar,
      isSuperAdmin: isSuperAdmin(userData.id),
    };
    req.session.guilds = adminGuilds;
    req.session.activeGuildId = adminGuilds[0].id;
    res.redirect(config.frontendUrl);
  } catch (err) {
    console.error('OAuth fout:', err);
    res.status(500).send('Authenticatie mislukt.');
  }
});

app.get('/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Niet ingelogd' });
  res.json({ ...req.session.user, isSuperAdmin: isSuperAdmin(req.session.user.id) });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Guilds API ──

app.get('/api/guilds', requireAuth, (req, res) => {
  res.json({ guilds: req.session.guilds || [], activeGuildId: req.session.activeGuildId || null });
});

// ── Vragen API ──

const mapVraag = v => ({ id: v.id, tekst: v.tekst, categorie: v.categorie, dmModus: v.dm_modus === 1 });

app.get('/api/vragen', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const waarheid = stmts.getVragen.all(guildId, 'waarheid').map(mapVraag);
  const doen = stmts.getVragen.all(guildId, 'doen').map(mapVraag);
  res.json({ waarheid, doen });
});

app.post('/api/vragen', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const { type, tekst, categorie, dmModus } = req.body;
  if (!['waarheid', 'doen'].includes(type) || !tekst?.trim()) {
    return res.status(400).json({ error: 'Ongeldige invoer.' });
  }
  stmts.insertVraag.run(guildId, type, tekst.trim(), categorie?.trim() || '18+', dmModus ? 1 : 0);
  res.json({ ok: true });
});

app.put('/api/vragen/:id', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const id = parseInt(req.params.id);
  const { tekst, categorie, dmModus } = req.body;
  if (isNaN(id) || !tekst?.trim()) return res.status(400).json({ error: 'Ongeldige invoer.' });
  const result = stmts.updateVraag.run(tekst.trim(), categorie?.trim() || '18+', dmModus ? 1 : 0, id, guildId);
  if (result.changes === 0) return res.status(404).json({ error: 'Vraag niet gevonden.' });
  res.json({ ok: true });
});

app.delete('/api/vragen/:id', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Ongeldige invoer.' });
  const vraag = db.prepare('SELECT * FROM vragen WHERE id = ? AND guild_id = ?').get(id, guildId);
  if (!vraag) return res.status(404).json({ error: 'Vraag niet gevonden.' });
  const result = stmts.deleteVraagById.run(id, guildId);
  if (result.changes === 0) return res.status(404).json({ error: 'Vraag niet gevonden.' });
  const guildSessies = stmts.getSessiesGuild.all(guildId);
  for (const s of guildSessies) {
    const cache = sessieCache.get(s.id);
    if (cache) {
      if (vraag.type === 'waarheid') cache.gebruikteWaarheid.delete(id);
      else cache.gebruikteDoen.delete(id);
    }
  }
  res.json({ ok: true });
});

// ── Vragen export / import ──

function escapeCSV(val) {
  return `"${String(val).replace(/"/g, '""')}"`;
}

function parseCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current); current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

app.get('/api/vragen/export', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const rows = [['type', 'tekst', 'categorie']];
  stmts.getVragen.all(guildId, 'waarheid').forEach(v => rows.push(['waarheid', v.tekst, v.categorie]));
  stmts.getVragen.all(guildId, 'doen').forEach(v => rows.push(['doen', v.tekst, v.categorie]));
  const csv = rows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vragen.csv"');
  res.send(csv);
});

app.post('/api/vragen/import', requireAuth, requireGuild, express.text({ type: '*/*' }), (req, res) => {
  const guildId = req.session.activeGuildId;
  try {
    const lines = req.body.trim().split(/\r?\n/);
    if (lines.length < 2) return res.status(400).json({ error: 'Bestand bevat geen data.' });
    const header = parseCSVRow(lines[0]).map(h => h.toLowerCase());
    const typeIdx = header.indexOf('type');
    const tekstIdx = header.indexOf('tekst');
    const catIdx = header.indexOf('categorie');
    if (typeIdx === -1 || tekstIdx === -1) {
      return res.status(400).json({ error: 'Kolommen "type" en "tekst" zijn verplicht.' });
    }
    let toegevoegd = 0;
    let overgeslagen = 0;
    const insertMany = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVRow(lines[i]);
        const type = row[typeIdx]?.toLowerCase().trim();
        const tekst = row[tekstIdx]?.trim();
        const categorie = catIdx !== -1 ? (row[catIdx]?.trim() || '18+') : '18+';
        if (!tekst || !['waarheid', 'doen'].includes(type)) continue;
        const r = stmts.insertVraag.run(guildId, type, tekst, categorie, 0);
        if (r.changes === 1) { toegevoegd++; } else { overgeslagen++; }
      }
    });
    insertMany();
    res.json({ success: true, toegevoegd, overgeslagen });
  } catch {
    res.status(400).json({ error: 'Fout bij verwerken van bestand.' });
  }
});

// ── Ranglijst API ──

app.get('/api/ranglijst', requireAuth, requireGuild, (req, res) => {
  const rows = stmts.getRanglijst.all(req.session.activeGuildId);
  res.json(rows);
});

// ── Statistieken API ──

app.get('/api/statistieken', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const sessies = stmts.getSessiesGuild.all(guildId).filter(s => s.status !== 'beeindigd');
  const waarheidTotaal = stmts.countVragen.get(guildId, 'waarheid').cnt;
  const doenTotaal = stmts.countVragen.get(guildId, 'doen').cnt;
  const sessieStats = sessies.map(s => {
    const cache = sessieCache.get(s.id);
    return {
      id: s.id,
      naam: s.naam,
      status: s.status,
      channelId: s.channel_id,
      sessieStart: s.sessie_start_iso,
      aantalWaarheid: cache ? cache.aantalWaarheid : s.aantal_waarheid,
      aantalDoen: cache ? cache.aantalDoen : s.aantal_doen,
      rerollTeller: cache ? Object.fromEntries(cache.rerollTeller) : JSON.parse(s.reroll_teller),
    };
  });
  res.json({ sessies: sessieStats, waarheidTotaal, doenTotaal });
});

app.post('/api/reset', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const sessies = stmts.getSessiesGuild.all(guildId).filter(s => s.status === 'actief');
  for (const s of sessies) {
    saveSessieCache(s.id);
    stmts.updateSessieStatus.run('beeindigd', s.id);
    sessieCache.delete(s.id);
  }
  db.prepare('DELETE FROM actieve_sessie WHERE guild_id = ?').run(guildId);
  res.json({ ok: true });
});

app.post('/api/reload', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const sessies = stmts.getSessiesGuild.all(guildId).filter(s => s.status === 'actief');
  for (const s of sessies) {
    const cache = getSessieCache(s.id);
    if (cache) { cache.gebruikteWaarheid.clear(); cache.gebruikteDoen.clear(); saveSessieCache(s.id); }
  }
  res.json({ ok: true });
});

// ── Sessies API ──

app.get('/api/sessies', requireAuth, requireGuild, (req, res) => {
  const sessies = stmts.getSessiesGuild.all(req.session.activeGuildId);
  res.json(sessies.map(s => {
    const cache = sessieCache.get(s.id);
    return {
      ...s,
      aantalWaarheid: cache ? cache.aantalWaarheid : s.aantal_waarheid,
      aantalDoen: cache ? cache.aantalDoen : s.aantal_doen,
    };
  }));
});

app.delete('/api/sessies/:id', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Ongeldig ID.' });
  const sessie = stmts.getSessieById.get(id);
  if (!sessie || sessie.guild_id !== guildId) return res.status(404).json({ error: 'Niet gevonden.' });
  saveSessieCache(id);
  stmts.updateSessieStatus.run('beeindigd', id);
  db.prepare('DELETE FROM actieve_sessie WHERE guild_id = ? AND sessie_id = ?').run(guildId, id);
  sessieCache.delete(id);
  res.json({ ok: true });
});

// ── Instellingen API ──

app.get('/api/instellingen', requireAuth, requireGuild, (req, res) => {
  res.json(dbGetInstellingen(req.session.activeGuildId));
});

app.put('/api/instellingen', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const inst = dbGetInstellingen(guildId);
  const { cooldownMs, dmModus, autoCategorieMappen, categoriePerChat } = req.body;
  const newCooldown = typeof cooldownMs === 'number' && cooldownMs >= 0 && cooldownMs <= 10000 ? cooldownMs : inst.cooldownMs;
  const newDM = typeof dmModus === 'boolean' ? dmModus : inst.dmModus;
  const newAutoMap = typeof autoCategorieMappen === 'boolean' ? autoCategorieMappen : inst.autoCategorieMappen;
  const newPerChat = typeof categoriePerChat === 'boolean' ? categoriePerChat : inst.categoriePerChat;
  stmts.upsertInstellingen.run(guildId, newCooldown, newDM ? 1 : 0, newAutoMap ? 1 : 0, newPerChat ? 1 : 0);
  res.json({ cooldownMs: newCooldown, dmModus: newDM, autoCategorieMappen: newAutoMap, categoriePerChat: newPerChat });
});

// ── Nooit-stellingen API ──

app.get('/api/nooit', requireAuth, requireGuild, (req, res) => {
  res.json(stmts.getAllNooit.all(req.session.activeGuildId));
});

app.post('/api/nooit', requireAuth, requireGuild, (req, res) => {
  const { tekst } = req.body;
  if (!tekst?.trim()) return res.status(400).json({ error: 'Tekst is verplicht.' });
  stmts.insertNooit.run(req.session.activeGuildId, tekst.trim());
  res.json({ ok: true });
});

app.put('/api/nooit/:id', requireAuth, requireGuild, (req, res) => {
  const id = parseInt(req.params.id);
  const { tekst } = req.body;
  if (isNaN(id) || !tekst?.trim()) return res.status(400).json({ error: 'Ongeldige invoer.' });
  const result = stmts.updateNooit.run(tekst.trim(), id, req.session.activeGuildId);
  if (result.changes === 0) return res.status(404).json({ error: 'Stelling niet gevonden.' });
  res.json({ ok: true });
});

app.delete('/api/nooit/:id', requireAuth, requireGuild, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Ongeldige invoer.' });
  const result = stmts.deleteNooit.run(id, req.session.activeGuildId);
  if (result.changes === 0) return res.status(404).json({ error: 'Stelling niet gevonden.' });
  res.json({ ok: true });
});

// ── Channel-categorie mapping API ──

app.get('/api/channel-categorie', requireAuth, requireGuild, (req, res) => {
  res.json(stmts.getAllChannelCategorie.all(req.session.activeGuildId));
});

app.post('/api/channel-categorie', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const { channelId, categorie } = req.body;
  if (!channelId || !categorie?.trim()) return res.status(400).json({ error: 'channelId en categorie zijn verplicht.' });
  stmts.upsertChannelCategorie.run(guildId, channelId, categorie.trim());
  res.json({ ok: true });
});

app.delete('/api/channel-categorie/:channelId', requireAuth, requireGuild, (req, res) => {
  stmts.deleteChannelCategorie.run(req.session.activeGuildId, req.params.channelId);
  res.json({ ok: true });
});

// ── Discord kanalen API ──

app.get('/api/kanalen', requireAuth, requireGuild, (req, res) => {
  const guild = _client.guilds.cache.get(req.session.activeGuildId);
  if (!guild) return res.status(404).json({ error: 'Server niet gevonden.' });
  const kanalen = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText)
    .map(c => ({ id: c.id, name: c.name, parentName: c.parent?.name ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(kanalen);
});

// ── Categoriemappen aanmaken API ──

app.post('/api/categoriemappen/aanmaken', requireAuth, requireGuild, async (req, res) => {
  const guildId = req.session.activeGuildId;
  const guild = _client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ error: 'Server niet gevonden.' });
  try {
    const categories = stmts.getDistinctCats.all(guildId).map(r => r.categorie);
    if (categories.length === 0) return res.status(400).json({ error: 'Geen vraagcategorieën gevonden. Voeg eerst vragen toe.' });

    const catChannel = await guild.channels.create({
      name: '🎮 Waarheid of Doen',
      type: ChannelType.GuildCategory,
    });

    const created = [];
    for (const cat of categories) {
      const channelName = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'overig';
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: catChannel.id,
      });
      stmts.upsertChannelCategorie.run(guildId, channel.id, cat);
      created.push({ channelId: channel.id, channelName: channel.name, categorie: cat });
    }

    const inst = dbGetInstellingen(guildId);
    stmts.upsertInstellingen.run(guildId, inst.cooldownMs, inst.dmModus ? 1 : 0, 1, inst.categoriePerChat ? 1 : 0);

    res.json({ ok: true, aangemaakt: created });
  } catch (err) {
    console.error('Fout bij aanmaken categoriemappen:', err.message);
    res.status(500).json({ error: 'Fout bij aanmaken kanalen: ' + err.message });
  }
});

// ── Reset-configuratie API ──

app.post('/api/reset-config', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  stmts.upsertInstellingen.run(guildId, 1500, 0, 0, 0);
  db.prepare('DELETE FROM channel_categorie WHERE guild_id = ?').run(guildId);
  res.json({ ok: true });
});

// ── Beschikbare vraagcategorieën API ──

app.get('/api/categorieen', requireAuth, requireGuild, (req, res) => {
  res.json(stmts.getDistinctCats.all(req.session.activeGuildId).map(r => r.categorie));
});

// ── Servers API (superadmin) ──

app.get('/api/servers', requireAuth, requireSuperAdmin, (req, res) => {
  const servers = stmts.getAllBotServers.all().map(s => {
    const guild = _client.guilds.cache.get(s.guild_id);
    return {
      ...s,
      online: !!guild,
      member_count: guild?.memberCount ?? s.member_count,
      vragen_waarheid: stmts.countVragen.get(s.guild_id, 'waarheid').cnt,
      vragen_doen:     stmts.countVragen.get(s.guild_id, 'doen').cnt,
      sessies_actief:  stmts.getSessiesGuild.all(s.guild_id).filter(x => x.status === 'actief').length,
    };
  });
  res.json(servers);
});

app.delete('/api/servers/:guildId', requireAuth, requireSuperAdmin, async (req, res) => {
  const { guildId } = req.params;
  const guild = _client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ error: 'Server niet gevonden of bot is er al weg.' });
  try {
    await guild.leave();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Verlaten mislukt: ' + err.message });
  }
});

app.post('/api/guild', requireAuth, (req, res) => {
  const { guildId } = req.body;
  const guilds = req.session.guilds || [];
  if (!isSuperAdmin(req.session.user.id) && !guilds.find(g => g.id === guildId)) {
    return res.status(403).json({ error: 'Geen toegang tot deze server.' });
  }
  if (isSuperAdmin(req.session.user.id) && !guilds.find(g => g.id === guildId)) {
    const guild = _client.guilds.cache.get(guildId);
    if (guild) req.session.guilds = [...guilds, { id: guild.id, name: guild.name, icon: guild.icon ?? null }];
  }
  req.session.activeGuildId = guildId;
  res.json({ ok: true });
});

// ── Configuratie API ──

app.get('/api/config', requireAuth, (req, res) => {
  res.json(config);
});

app.put('/api/config', requireAuth, (req, res) => {
  const { redirectUri, frontendUrl } = req.body;
  if (redirectUri && typeof redirectUri === 'string') config.redirectUri = redirectUri.trim();
  if (frontendUrl && typeof frontendUrl === 'string') config.frontendUrl = frontendUrl.trim();
  slaConfigOp();
  res.json(config);
});

// ── Statische bestanden (productie) ──

const adminDist = join(__dirname, '..', 'admin', 'dist');
if (existsSync(adminDist)) {
  app.use(express.static(adminDist));
  app.get('*', (req, res) => res.sendFile(join(adminDist, 'index.html')));
}

export function startServer() {
  app.listen(ADMIN_PORT, () => {
    console.log(`✅ Admin panel API draait op http://localhost:${ADMIN_PORT}`);
  });
}

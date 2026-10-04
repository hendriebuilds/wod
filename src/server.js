import express from 'express';
import session from 'express-session';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ChannelType, DiscordAPIError, PermissionFlagsBits } from 'discord.js';
import { db, stmts, dbGetInstellingen } from './database.js';
import { sessieCache, getSessieCache, saveSessieCache, getLevelInfo, CATEGORIEEN, normaliseerCategorie, isGeldigeCategorie, MAX_LENGTE } from './game.js';
import { config, slaConfigOp, isSuperAdmin } from './config.js';
import { SqliteStore } from './sessionStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _client = null;
export function setClient(client) { _client = client; }

const app = express();
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || '3001');
const DISCORD_API = 'https://discord.com/api/v10';

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  next();
});

// ── Healthcheck (Docker/Unraid) ──
// Vóór de sessie, zodat een check geen sessie aanmaakt. Publiek bereikbaar: geen details, geen logregel.
app.get('/health', (req, res) => {
  const klaar = _client?.isReady() ?? false;
  res.status(klaar ? 200 : 503).json({ status: klaar ? 'ok' : 'starting' });
});

// ── CSRF: schrijvende verzoeken alleen vanaf het panel zelf ──
// Geldt voor /api/* en POST /auth/logout. Origin (of anders Referer) moet gelijk
// zijn aan frontendUrl, die elke keer opnieuw gelezen wordt. Een body moet JSON zijn.
const VEILIGE_METHODES = new Set(['GET', 'HEAD', 'OPTIONS']);

function toegestaneOrigin() {
  try { return new URL(config.frontendUrl).origin; } catch { return null; }
}

function vereisZelfdeOrigin(req, res, next) {
  if (VEILIGE_METHODES.has(req.method)) return next();
  // Express routeert hoofdletterongevoelig en negeert een slash aan het eind
  const pad = req.path.toLowerCase().replace(/\/+$/, '');
  if (!pad.startsWith('/api/') && pad !== '/auth/logout') return next();

  let origin = req.get('origin') || null;
  if (!origin) {
    try { origin = new URL(req.get('referer')).origin; } catch { origin = null; }
  }
  const toegestaan = toegestaneOrigin();
  if (!origin || !toegestaan || origin !== toegestaan) {
    console.warn(`🛡️ Verzoek geweigerd (csrf): ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Verzoek niet toegestaan.', code: 'csrf' });
  }

  const heeftBody = parseInt(req.get('content-length') || '0', 10) > 0 || req.get('transfer-encoding');
  if (heeftBody && !req.is('application/json')) {
    return res.status(415).json({ error: 'Alleen JSON.', code: 'content_type' });
  }
  next();
}

app.use(vereisZelfdeOrigin);
app.use(express.json({ limit: '2mb' }));

// secure wordt bij het starten bepaald; een gewijzigde frontendUrl geldt pas na een herstart
const cookieSecure = config.frontendUrl.startsWith('https://');
console.log(`🔒 Sessie-cookie: secure=${cookieSecure}`);
app.use(session({
  name: 'wod.sid',
  store: new SqliteStore(),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Niet ingelogd' });
  next();
}

// ── Rechten opnieuw controleren (cache 60 s) ──

const toegangCache = new Map(); // `${userId}:${guildId}` → { ok, verloopt }
const TOEGANG_TTL = 60_000;
const GEEN_LID_CODES = new Set([10004, 10007]); // Unknown Guild, Unknown Member

class DiscordOnbereikbaar extends Error {}

async function heeftToegang(userId, guildId) {
  if (isSuperAdmin(userId)) return true;
  const sleutel = `${userId}:${guildId}`;
  const hit = toegangCache.get(sleutel);
  if (hit && hit.verloopt > Date.now()) return hit.ok;
  let ok = false;
  const guild = _client.guilds.cache.get(guildId);
  if (guild) {
    try {
      const member = await guild.members.fetch(userId);
      ok = member.permissions.has(PermissionFlagsBits.ManageGuild);
    } catch (err) {
      // Alleen "geen lid/server" trekt de toegang in; andere Discord-fouten niet en worden niet gecachet
      if (!(err instanceof DiscordAPIError && GEEN_LID_CODES.has(err.code))) {
        console.error('❌ Rechten controleren mislukt:', err.message);
        throw new DiscordOnbereikbaar();
      }
    }
  }
  toegangCache.set(sleutel, { ok, verloopt: Date.now() + TOEGANG_TTL });
  return ok;
}

function stuurOnbereikbaar(res) {
  return res.status(503).json({ error: 'Discord is tijdelijk niet bereikbaar.' });
}

async function requireGuild(req, res, next) {
  try {
    const guildId = req.session.activeGuildId;
    if (!guildId) return res.status(400).json({ error: 'Geen server geselecteerd.' });
    const userId = req.session.user.id;
    if (await heeftToegang(userId, guildId)) return next();

    toegangCache.delete(`${userId}:${guildId}`);
    req.session.guilds = (req.session.guilds || []).filter(g => g.id !== guildId);
    if (req.session.guilds.length > 0) {
      req.session.activeGuildId = req.session.guilds[0].id;
      return res.status(403).json({ error: 'Geen toegang meer tot deze server.', code: 'geen_toegang_server' });
    }
    req.session.destroy(() => res.status(401).json({ error: 'Niet ingelogd' }));
  } catch (err) {
    if (err instanceof DiscordOnbereikbaar) return stuurOnbereikbaar(res);
    next(err);
  }
}

function requireSuperAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Niet ingelogd' });
  if (!isSuperAdmin(req.session.user.id)) return res.status(403).json({ error: 'Geen superadmin-rechten.' });
  next();
}

// ── Auth ──

app.get('/auth/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });
  req.session.save(() => res.redirect(`https://discord.com/api/oauth2/authorize?${params}`));
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  const verwachteState = req.session.oauthState;
  delete req.session.oauthState;
  if (!state || !verwachteState || state !== verwachteState) {
    return res.redirect(`${config.frontendUrl}?error=ongeldige_login`);
  }
  if (!code) return res.redirect(`${config.frontendUrl}?error=login_mislukt`);
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

    // Nieuwe sessie-ID na het inloggen (tegen sessiefixatie)
    req.session.regenerate(err => {
      if (err) {
        console.error('❌ Sessie vernieuwen mislukt:', err);
        return res.redirect(`${config.frontendUrl}?error=login_mislukt`);
      }
      req.session.user = {
        id: userData.id,
        username: userData.username,
        avatar: userData.avatar,
        isSuperAdmin: isSuperAdmin(userData.id),
      };
      req.session.guilds = adminGuilds;
      req.session.activeGuildId = adminGuilds[0].id;
      req.session.save(() => res.redirect(config.frontendUrl));
    });
  } catch (err) {
    console.error('OAuth fout:', err);
    res.redirect(`${config.frontendUrl}?error=login_mislukt`);
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
  if (!['waarheid', 'doen'].includes(type) || typeof tekst !== 'string' || !tekst.trim()) {
    return res.status(400).json({ error: 'Ongeldige invoer.' });
  }
  if (tekst.trim().length > MAX_LENGTE.vraag) return res.status(400).json({ error: 'Tekst is te lang.', code: 'te_lang' });
  const cat = normaliseerCategorie(categorie);
  if (!isGeldigeCategorie(cat)) return res.status(400).json({ error: 'Onbekende categorie.', code: 'ongeldige_categorie' });
  stmts.insertVraag.run(guildId, type, tekst.trim(), cat, dmModus ? 1 : 0);
  res.json({ ok: true });
});

app.put('/api/vragen/:id', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const id = parseInt(req.params.id);
  const { tekst, categorie, dmModus } = req.body;
  if (isNaN(id) || typeof tekst !== 'string' || !tekst.trim()) return res.status(400).json({ error: 'Ongeldige invoer.' });
  if (tekst.trim().length > MAX_LENGTE.vraag) return res.status(400).json({ error: 'Tekst is te lang.', code: 'te_lang' });
  const vraag =db.prepare('SELECT categorie FROM vragen WHERE id = ? AND guild_id = ?').get(id, guildId);
  if (!vraag) return res.status(404).json({ error: 'Vraag niet gevonden.' });
  // Zonder categorie blijft de huidige staan (ook een oude, onbekende)
  let cat = vraag.categorie;
  if (categorie !== undefined) {
    cat = normaliseerCategorie(categorie);
    if (!isGeldigeCategorie(cat)) return res.status(400).json({ error: 'Onbekende categorie.', code: 'ongeldige_categorie' });
  }
  const result = stmts.updateVraag.run(tekst.trim(), cat, dmModus ? 1 : 0, id, guildId);
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

app.post('/api/vragen/import', requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  try {
    const csv = req.body?.csv;
    if (typeof csv !== 'string' || !csv.trim()) return res.status(400).json({ error: 'Bestand bevat geen data.' });
    const lines = csv.trim().split(/\r?\n/);
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
    let ongeldig = 0;
    const insertMany = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = parseCSVRow(lines[i]);
        const type = row[typeIdx]?.toLowerCase().trim();
        const tekst = row[tekstIdx]?.trim();
        const categorie = normaliseerCategorie(catIdx !== -1 ? row[catIdx] : '');
        if (!tekst || tekst.length > MAX_LENGTE.vraag || !['waarheid', 'doen'].includes(type) || !isGeldigeCategorie(categorie)) { ongeldig++; continue; }
        const r = stmts.insertVraag.run(guildId, type, tekst, categorie, 0);
        if (r.changes === 1) { toegevoegd++; } else { overgeslagen++; }
      }
    });
    insertMany();
    res.json({ success: true, toegevoegd, overgeslagen, ongeldig });
  } catch {
    res.status(400).json({ error: 'Fout bij verwerken van bestand.' });
  }
});

// ── Ranglijst API ──

app.get('/api/ranglijst', requireAuth, requireGuild, (req, res) => {
  const rows = stmts.getRanglijst.all(req.session.activeGuildId);
  res.json(rows.map(row => ({ ...row, level: getLevelInfo(row.punten).level })));
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
  if (typeof tekst !== 'string' || !tekst.trim()) return res.status(400).json({ error: 'Tekst is verplicht.' });
  if (tekst.trim().length > MAX_LENGTE.stelling) return res.status(400).json({ error: 'Tekst is te lang.', code: 'te_lang' });
  stmts.insertNooit.run(req.session.activeGuildId, tekst.trim());
  res.json({ ok: true });
});

app.put('/api/nooit/:id', requireAuth, requireGuild, (req, res) => {
  const id = parseInt(req.params.id);
  const { tekst } = req.body;
  if (isNaN(id) || typeof tekst !== 'string' || !tekst.trim()) return res.status(400).json({ error: 'Ongeldige invoer.' });
  if (tekst.trim().length > MAX_LENGTE.stelling) return res.status(400).json({ error: 'Tekst is te lang.', code: 'te_lang' });
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
  if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId)) return res.status(400).json({ error: 'Ongeldig kanaal.' });
  const cat = normaliseerCategorie(categorie);
  if (!isGeldigeCategorie(cat)) return res.status(400).json({ error: 'Onbekende categorie.', code: 'ongeldige_categorie' });
  // Zelfde kanaaltypes als GET /api/kanalen
  const kanaal = _client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
  if (!kanaal || kanaal.type !== ChannelType.GuildText) return res.status(400).json({ error: 'Ongeldig kanaal.' });
  stmts.upsertChannelCategorie.run(guildId, channelId, cat);
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
    const categories = stmts.getDistinctCats.all(guildId).map(r => r.categorie).filter(isGeldigeCategorie);
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
  res.json(Object.keys(CATEGORIEEN));
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

app.post('/api/guild', requireAuth, async (req, res) => {
  const { guildId } = req.body;
  const guilds = req.session.guilds || [];
  if (!isSuperAdmin(req.session.user.id)) {
    if (!guilds.find(g => g.id === guildId)) return res.status(403).json({ error: 'Geen toegang tot deze server.' });
    try {
      if (!(await heeftToegang(req.session.user.id, guildId))) {
        req.session.guilds = guilds.filter(g => g.id !== guildId);
        return res.status(403).json({ error: 'Geen toegang tot deze server.' });
      }
    } catch (err) {
      if (err instanceof DiscordOnbereikbaar) return stuurOnbereikbaar(res);
      console.error('❌ Server wisselen mislukt:', err);
      return res.status(500).json({ error: 'Server wisselen mislukt.' });
    }
  }
  if (isSuperAdmin(req.session.user.id) && !guilds.find(g => g.id === guildId)) {
    const guild = _client.guilds.cache.get(guildId);
    if (guild) req.session.guilds = [...guilds, { id: guild.id, name: guild.name, icon: guild.icon ?? null }];
  }
  req.session.activeGuildId = guildId;
  res.json({ ok: true });
});

// ── Configuratie API ──

app.get('/api/config', requireSuperAdmin, (req, res) => {
  res.json(config);
});

function isGeldigeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

app.put('/api/config', requireSuperAdmin, (req, res) => {
  const { redirectUri, frontendUrl } = req.body;
  const nieuweRedirect = typeof redirectUri === 'string' && redirectUri.trim() ? redirectUri.trim() : config.redirectUri;
  const nieuweFrontend = typeof frontendUrl === 'string' && frontendUrl.trim() ? frontendUrl.trim() : config.frontendUrl;
  if (!isGeldigeUrl(nieuweRedirect) || !new URL(nieuweRedirect).pathname.endsWith('/auth/callback') || !isGeldigeUrl(nieuweFrontend)) {
    return res.status(400).json({ error: 'Ongeldige URL.' });
  }
  config.redirectUri = nieuweRedirect;
  config.frontendUrl = nieuweFrontend;
  slaConfigOp();
  res.json(config);
});

// ── Statische bestanden (productie) ──

const adminDist = join(__dirname, '..', 'admin', 'dist');
if (existsSync(adminDist)) {
  app.use(express.static(adminDist));
  app.get('*', (req, res) => res.sendFile(join(adminDist, 'index.html')));
}

// ── Fouten altijd als JSON (nooit een HTML-pagina met stacktrace) ──
// Geen headers, cookies of body loggen.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ongeldige JSON.', code: 'ongeldige_json' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Verzoek te groot.', code: 'te_groot' });
  console.error(`❌ Fout in ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Er ging iets mis.', code: 'serverfout' });
});

export function startServer() {
  return app.listen(ADMIN_PORT, () => {
    console.log(`✅ Admin panel API draait op http://localhost:${ADMIN_PORT}`);
  });
}

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, 'bot.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS vragen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('waarheid','doen')),
    tekst TEXT NOT NULL,
    categorie TEXT NOT NULL DEFAULT '18+',
    dm_modus INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS instellingen (
    guild_id TEXT PRIMARY KEY,
    cooldown_ms INTEGER NOT NULL DEFAULT 1500,
    dm_modus INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_vragen_guild_type ON vragen(guild_id, type);
  CREATE TABLE IF NOT EXISTS nooit_stellingen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    tekst TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_nooit_guild ON nooit_stellingen(guild_id);
  CREATE TABLE IF NOT EXISTS wod_sessies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    naam TEXT NOT NULL DEFAULT 'Sessie',
    status TEXT NOT NULL DEFAULT 'actief' CHECK(status IN ('actief','gepauzeerd','beeindigd')),
    aangemaakt_op INTEGER NOT NULL DEFAULT (unixepoch()),
    sessie_start_iso TEXT NOT NULL DEFAULT (datetime('now')),
    gebruikte_waarheid TEXT NOT NULL DEFAULT '[]',
    gebruikte_doen TEXT NOT NULL DEFAULT '[]',
    aantal_waarheid INTEGER NOT NULL DEFAULT 0,
    aantal_doen INTEGER NOT NULL DEFAULT 0,
    reroll_teller TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS actieve_sessie (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    sessie_id INTEGER NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
  );
  CREATE INDEX IF NOT EXISTS idx_sessies_guild ON wod_sessies(guild_id);
`);

try { db.exec('ALTER TABLE instellingen ADD COLUMN auto_categorie_mappen INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE instellingen ADD COLUMN categorie_per_chat INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE user_levels ADD COLUMN reroll_teller INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE user_levels ADD COLUMN passen_teller INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE user_levels ADD COLUMN rondes_teller INTEGER NOT NULL DEFAULT 0'); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS channel_categorie (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    categorie TEXT NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
  );
  CREATE INDEX IF NOT EXISTS idx_channel_cat ON channel_categorie(guild_id, channel_id);
  CREATE TABLE IF NOT EXISTS user_levels (
    guild_id      TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    user_naam     TEXT NOT NULL,
    punten        INTEGER NOT NULL DEFAULT 0,
    level         INTEGER NOT NULL DEFAULT 1,
    reroll_teller INTEGER NOT NULL DEFAULT 0,
    passen_teller INTEGER NOT NULL DEFAULT 0,
    rondes_teller INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS user_achievements (
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    achievement TEXT NOT NULL,
    behaald_op  INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id, achievement)
  );
  CREATE TABLE IF NOT EXISTS bot_servers (
    guild_id   TEXT PRIMARY KEY,
    naam       TEXT NOT NULL,
    icon       TEXT,
    member_count INTEGER NOT NULL DEFAULT 0,
    owner_id   TEXT,
    joined_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    laatste_update INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

export const stmts = {
  getVragen:              db.prepare('SELECT * FROM vragen WHERE guild_id = ? AND type = ? ORDER BY id'),
  getVragenByCategorie:   db.prepare('SELECT * FROM vragen WHERE guild_id = ? AND type = ? AND categorie = ? ORDER BY id'),
  countVragen:            db.prepare('SELECT COUNT(*) AS cnt FROM vragen WHERE guild_id = ? AND type = ?'),
  insertVraag:            db.prepare('INSERT INTO vragen (guild_id, type, tekst, categorie, dm_modus) VALUES (?, ?, ?, ?, ?)'),
  updateVraag:            db.prepare('UPDATE vragen SET tekst = ?, categorie = ?, dm_modus = ? WHERE id = ? AND guild_id = ?'),
  deleteVraagById:        db.prepare('DELETE FROM vragen WHERE id = ? AND guild_id = ?'),
  getInstellingen:        db.prepare('SELECT * FROM instellingen WHERE guild_id = ?'),
  upsertInstellingen:     db.prepare(`
    INSERT INTO instellingen (guild_id, cooldown_ms, dm_modus, auto_categorie_mappen, categorie_per_chat)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      cooldown_ms = excluded.cooldown_ms,
      dm_modus = excluded.dm_modus,
      auto_categorie_mappen = excluded.auto_categorie_mappen,
      categorie_per_chat = excluded.categorie_per_chat
  `),
  ensureInstellingen:     db.prepare('INSERT OR IGNORE INTO instellingen (guild_id) VALUES (?)'),
  getNooitStelling:       db.prepare('SELECT * FROM nooit_stellingen WHERE guild_id = ? ORDER BY RANDOM() LIMIT 1'),
  getAllNooit:             db.prepare('SELECT * FROM nooit_stellingen WHERE guild_id = ? ORDER BY id'),
  countNooit:             db.prepare('SELECT COUNT(*) AS cnt FROM nooit_stellingen WHERE guild_id = ?'),
  insertNooit:            db.prepare('INSERT INTO nooit_stellingen (guild_id, tekst) VALUES (?, ?)'),
  updateNooit:            db.prepare('UPDATE nooit_stellingen SET tekst = ? WHERE id = ? AND guild_id = ?'),
  deleteNooit:            db.prepare('DELETE FROM nooit_stellingen WHERE id = ? AND guild_id = ?'),
  getChannelCategorie:    db.prepare('SELECT categorie FROM channel_categorie WHERE guild_id = ? AND channel_id = ?'),
  getAllChannelCategorie:  db.prepare('SELECT * FROM channel_categorie WHERE guild_id = ? ORDER BY channel_id'),
  upsertChannelCategorie: db.prepare(`
    INSERT INTO channel_categorie (guild_id, channel_id, categorie) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, channel_id) DO UPDATE SET categorie = excluded.categorie
  `),
  deleteChannelCategorie: db.prepare('DELETE FROM channel_categorie WHERE guild_id = ? AND channel_id = ?'),
  getDistinctCats:        db.prepare('SELECT DISTINCT categorie FROM vragen WHERE guild_id = ? ORDER BY categorie'),
  insertSessie:           db.prepare('INSERT INTO wod_sessies (guild_id, channel_id, naam) VALUES (?, ?, ?)'),
  getSessieById:          db.prepare('SELECT * FROM wod_sessies WHERE id = ?'),
  getSessiesGuild:        db.prepare('SELECT * FROM wod_sessies WHERE guild_id = ? ORDER BY aangemaakt_op DESC'),
  countSessies:           db.prepare('SELECT COUNT(*) AS cnt FROM wod_sessies WHERE guild_id = ?'),
  updateSessieStatus:     db.prepare('UPDATE wod_sessies SET status = ? WHERE id = ?'),
  updateSessieNaam:       db.prepare('UPDATE wod_sessies SET naam = ? WHERE id = ?'),
  updateSessieData:       db.prepare('UPDATE wod_sessies SET gebruikte_waarheid = ?, gebruikte_doen = ?, aantal_waarheid = ?, aantal_doen = ?, reroll_teller = ? WHERE id = ?'),
  getActieveSessieLink:   db.prepare('SELECT * FROM actieve_sessie WHERE guild_id = ? AND channel_id = ?'),
  upsertActieveSessieLink: db.prepare('INSERT INTO actieve_sessie (guild_id, channel_id, sessie_id) VALUES (?, ?, ?) ON CONFLICT(guild_id, channel_id) DO UPDATE SET sessie_id = excluded.sessie_id'),
  deleteActieveSessieLink: db.prepare('DELETE FROM actieve_sessie WHERE guild_id = ? AND channel_id = ?'),
  upsertBotServer: db.prepare(`
    INSERT INTO bot_servers (guild_id, naam, icon, member_count, owner_id, laatste_update)
    VALUES (?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(guild_id) DO UPDATE SET
      naam = excluded.naam, icon = excluded.icon,
      member_count = excluded.member_count, owner_id = excluded.owner_id,
      laatste_update = unixepoch()
  `),
  deleteBotServer:  db.prepare('DELETE FROM bot_servers WHERE guild_id = ?'),
  getAllBotServers:  db.prepare('SELECT * FROM bot_servers ORDER BY naam ASC'),
  getBotServer:     db.prepare('SELECT * FROM bot_servers WHERE guild_id = ?'),
  upsertUserLevel:  db.prepare(`
    INSERT INTO user_levels (guild_id, user_id, user_naam, punten, level, reroll_teller, passen_teller, rondes_teller)
    VALUES (?, ?, ?, ?, ?, 0, 0, 0)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      user_naam = excluded.user_naam,
      punten = punten + excluded.punten,
      level = excluded.level
  `),
  incrReroll:           db.prepare('UPDATE user_levels SET reroll_teller = reroll_teller + 1 WHERE guild_id = ? AND user_id = ?'),
  incrPassen:           db.prepare('UPDATE user_levels SET passen_teller = passen_teller + 1 WHERE guild_id = ? AND user_id = ?'),
  incrRondes:           db.prepare('UPDATE user_levels SET rondes_teller = rondes_teller + 1 WHERE guild_id = ? AND user_id = ?'),
  getUserLevel:         db.prepare('SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?'),
  getRanglijst:         db.prepare(`
    SELECT ul.*, COUNT(ua.achievement) AS achievement_count
    FROM user_levels ul
    LEFT JOIN user_achievements ua ON ul.guild_id = ua.guild_id AND ul.user_id = ua.user_id
    WHERE ul.guild_id = ?
    GROUP BY ul.guild_id, ul.user_id
    ORDER BY ul.punten DESC
    LIMIT 10
  `),
  insertAchievement:    db.prepare('INSERT OR IGNORE INTO user_achievements (guild_id, user_id, achievement) VALUES (?, ?, ?)'),
  getUserAchievements:  db.prepare('SELECT * FROM user_achievements WHERE guild_id = ? AND user_id = ? ORDER BY behaald_op ASC'),
};

export function dbGetInstellingen(guildId) {
  stmts.ensureInstellingen.run(guildId);
  const row = stmts.getInstellingen.get(guildId);
  return {
    cooldownMs: row.cooldown_ms,
    dmModus: row.dm_modus === 1,
    autoCategorieMappen: row.auto_categorie_mappen === 1,
    categoriePerChat: row.categorie_per_chat === 1,
  };
}

export const NOOIT_STELLINGEN = [
  'Nooit heb ik gedaan alsof ik ziek was om ergens onderuit te komen',
  'Nooit heb ik iemand geblokkeerd na een date',
  'Nooit heb ik midden in de nacht iemand een berichtje gestuurd',
  'Nooit heb ik iemand gestalkt op social media',
  'Nooit heb ik iemand kwaad gesproken achter zijn/haar rug',
  'Nooit heb ik gelogen op mijn cv',
  'Nooit heb ik iets gekocht en de bon bewaard om het later terug te brengen',
  'Nooit heb ik gedanst op een tafel of bar',
  'Nooit heb ik een geheim verteld dat ik had beloofd te bewaren',
  "Nooit heb ik gedronken voor 12 uur 's middags",
  "Nooit heb ik iemand's dagboek of berichten gelezen",
  'Nooit heb ik gedaan alsof ik het druk had om iemand te vermijden',
  'Nooit heb ik mij voorgedaan als iemand anders online',
  'Nooit heb ik gehuild bij een romantische film',
  'Nooit heb ik iemand anders de schuld gegeven van iets wat ik deed',
  'Nooit heb ik ergens geslapen wat ik niet van plan was',
  'Nooit heb ik een vreemde gekust',
  'Nooit heb ik een ex midden in de nacht teruggebeld of -getsxt',
  'Nooit heb ik iets gedaan wat eigenlijk niet mocht maar er toch mee weggekomen',
  'Nooit heb ik gedaan alsof ik iemand niet zag om een gesprek te vermijden',
];

export function getRandomNooit(guildId) {
  const row = stmts.getNooitStelling.get(guildId);
  if (row) return row.tekst;
  return NOOIT_STELLINGEN[Math.floor(Math.random() * NOOIT_STELLINGEN.length)];
}

export function syncGuildToDb(guild) {
  try {
    stmts.upsertBotServer.run(
      guild.id,
      guild.name,
      guild.icon ?? null,
      guild.memberCount ?? guild.approximateMemberCount ?? 0,
      guild.ownerId ?? null
    );
  } catch (err) {
    console.error(`❌ syncGuildToDb mislukt voor ${guild.id}:`, err.message);
  }
}

export function migreerVanJSON(guildIds) {
  if (guildIds.length === 0) return;

  const VRAGEN_PAD = existsSync(join(__dirname, '..', 'vragen.json'))
    ? join(__dirname, '..', 'vragen.json')
    : join(__dirname, '..', 'data', 'vragen.json');
  const INSTELLINGEN_PAD = existsSync(join(__dirname, '..', 'settings.json'))
    ? join(__dirname, '..', 'settings.json')
    : join(__dirname, '..', 'data', 'settings.json');

  const existingCount = db.prepare('SELECT COUNT(*) AS cnt FROM vragen').get().cnt;
  if (existingCount === 0 && existsSync(VRAGEN_PAD)) {
    try {
      const data = JSON.parse(readFileSync(VRAGEN_PAD, 'utf-8'));
      const insertMany = db.transaction((guildId) => {
        (data.waarheid || []).forEach(v => {
          const item = typeof v === 'string' ? { tekst: v, categorie: '18+', dmModus: false } : { categorie: '18+', dmModus: false, ...v };
          stmts.insertVraag.run(guildId, 'waarheid', item.tekst, item.categorie, item.dmModus ? 1 : 0);
        });
        (data.doen || []).forEach(v => {
          const item = typeof v === 'string' ? { tekst: v, categorie: '18+', dmModus: false } : { categorie: '18+', dmModus: false, ...v };
          stmts.insertVraag.run(guildId, 'doen', item.tekst, item.categorie, item.dmModus ? 1 : 0);
        });
      });
      guildIds.forEach(insertMany);
      console.log(`✅ Vragen gemigreerd naar ${guildIds.length} server(s).`);
    } catch (err) {
      console.error('❌ Migratie vragen.json mislukt:', err.message);
    }
  }

  if (existsSync(INSTELLINGEN_PAD)) {
    try {
      const data = JSON.parse(readFileSync(INSTELLINGEN_PAD, 'utf-8'));
      guildIds.forEach(guildId => {
        db.prepare('INSERT OR IGNORE INTO instellingen (guild_id, cooldown_ms, dm_modus) VALUES (?, ?, ?)')
          .run(guildId, data.cooldownMs ?? 1500, data.dmModus ? 1 : 0);
      });
      console.log(`✅ Instellingen gemigreerd naar ${guildIds.length} server(s).`);
    } catch (err) {
      console.error('❌ Migratie settings.json mislukt:', err.message);
    }
  }

  const seedNooit = db.transaction((guildId) => {
    if (stmts.countNooit.get(guildId).cnt === 0) {
      NOOIT_STELLINGEN.forEach(tekst => stmts.insertNooit.run(guildId, tekst));
    }
  });
  guildIds.forEach(seedNooit);
}

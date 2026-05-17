import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
} from "discord.js";
import * as dotenv from "dotenv";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import session from "express-session";
import cors from "cors";
import Database from "better-sqlite3";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PAD = join(__dirname, "config.json");
// migration only — check both old /app location and new /app/data location
const VRAGEN_PAD = existsSync(join(__dirname, "vragen.json"))
  ? join(__dirname, "vragen.json")
  : join(__dirname, "data", "vragen.json");
const INSTELLINGEN_PAD = existsSync(join(__dirname, "settings.json"))
  ? join(__dirname, "settings.json")
  : join(__dirname, "data", "settings.json");

// ─── Database ──────────────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR || join(__dirname, "data");
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "bot.db"));
db.pragma("journal_mode = WAL");
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
`);

const stmts = {
  getVragen:          db.prepare("SELECT * FROM vragen WHERE guild_id = ? AND type = ? ORDER BY id"),
  countVragen:        db.prepare("SELECT COUNT(*) AS cnt FROM vragen WHERE guild_id = ? AND type = ?"),
  insertVraag:        db.prepare("INSERT INTO vragen (guild_id, type, tekst, categorie, dm_modus) VALUES (?, ?, ?, ?, ?)"),
  updateVraag:        db.prepare("UPDATE vragen SET tekst = ?, categorie = ?, dm_modus = ? WHERE id = ? AND guild_id = ?"),
  deleteVraagById:    db.prepare("DELETE FROM vragen WHERE id = ? AND guild_id = ?"),
  getInstellingen:    db.prepare("SELECT * FROM instellingen WHERE guild_id = ?"),
  upsertInstellingen: db.prepare("INSERT INTO instellingen (guild_id, cooldown_ms, dm_modus) VALUES (?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET cooldown_ms = excluded.cooldown_ms, dm_modus = excluded.dm_modus"),
  ensureInstellingen: db.prepare("INSERT OR IGNORE INTO instellingen (guild_id) VALUES (?)"),
};

function dbGetInstellingen(guildId) {
  stmts.ensureInstellingen.run(guildId);
  const row = stmts.getInstellingen.get(guildId);
  return { cooldownMs: row.cooldown_ms, dmModus: row.dm_modus === 1 };
}

// ─── Per-guild in-memory state ─────────────────────────────────────────────────

const gebruikteVragen = new Map(); // `${guildId}-${type}` -> Set<id>
function getGebruikte(guildId, type) {
  const key = `${guildId}-${type}`;
  if (!gebruikteVragen.has(key)) gebruikteVragen.set(key, new Set());
  return gebruikteVragen.get(key);
}

const sessieData = new Map(); // guildId -> { sessieStart, aantalWaarheid, aantalDoen, rerollTeller }
function getSessie(guildId) {
  if (!sessieData.has(guildId)) {
    sessieData.set(guildId, { sessieStart: new Date(), aantalWaarheid: 0, aantalDoen: 0, rerollTeller: new Map() });
  }
  return sessieData.get(guildId);
}

const beurtenMap = new Map(); // guildId -> { lijst: [{id, naam}], huidig: number }
function getBeurten(guildId) {
  if (!beurtenMap.has(guildId)) beurtenMap.set(guildId, { lijst: [], huidig: 0 });
  return beurtenMap.get(guildId);
}

// ─── Vraag helpers ─────────────────────────────────────────────────────────────

function getVraag(guildId, type) {
  const vragen = stmts.getVragen.all(guildId, type);
  if (vragen.length === 0) return null;
  const gebruikte = getGebruikte(guildId, type);
  if (gebruikte.size >= vragen.length) {
    gebruikte.clear();
    console.log(`🔄 Alle ${type} vragen geweest voor guild ${guildId}, lijst gereset.`);
  }
  const beschikbaar = vragen.filter(v => !gebruikte.has(v.id));
  const vraag = beschikbaar[Math.floor(Math.random() * beschikbaar.length)];
  gebruikte.add(vraag.id);
  return vraag;
}

// ─── Cooldown ──────────────────────────────────────────────────────────────────

const cooldowns = new Set();
function inCooldown(userId, guildId) {
  if (cooldowns.has(userId)) return true;
  cooldowns.add(userId);
  const { cooldownMs } = dbGetInstellingen(guildId);
  setTimeout(() => cooldowns.delete(userId), cooldownMs);
  return false;
}

// ─── Configuratie ──────────────────────────────────────────────────────────────

const config = {
  redirectUri: "http://localhost:3001/auth/callback",
  frontendUrl: "http://localhost:3001",
};

function laadConfig() {
  try {
    const data = JSON.parse(readFileSync(CONFIG_PAD, "utf-8"));
    Object.assign(config, data);
    console.log("✅ Configuratie geladen.");
  } catch {
    console.log("ℹ️ Geen config.json, standaardwaarden gebruikt.");
  }
}

function slaConfigOp() {
  try {
    writeFileSync(CONFIG_PAD, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Fout bij opslaan configuratie:", err.message);
  }
}

laadConfig();

// ─── Liefdestaal test ─────────────────────────────────────────────────────────

const LIEFDESTAAL_VRAGEN = [
  { vraag: 'Na een zware dag voel ik me het best als iemand...',
    a: { tekst: 'Mij opbeurt met lieve, oprechte woorden', taal: 'W' },
    b: { tekst: 'Alle aandacht en tijd aan mij geeft', taal: 'T' } },
  { vraag: 'Ik voel me het meest begrepen als iemand...',
    a: { tekst: 'Mij aanmoedigt of een compliment geeft', taal: 'W' },
    b: { tekst: 'Mij spontaan aanraakt, knuffelt of mijn hand pakt', taal: 'A' } },
  { vraag: 'Als iemand echt om mij geeft, toont dat door...',
    a: { tekst: 'Mij te vertellen wat ik voor hen beteken', taal: 'W' },
    b: { tekst: 'Dingen voor mij te doen zonder dat ik erom vraag', taal: 'D' } },
  { vraag: 'Mijn hart gaat sneller van...',
    a: { tekst: '"Ik ben zo trots op jou" of "Je ziet er geweldig uit"', taal: 'W' },
    b: { tekst: 'Een onverwacht cadeautje, hoe klein ook', taal: 'C' } },
  { vraag: 'De perfecte avond is voor mij...',
    a: { tekst: 'Samen op de bank, telefoon weg, gewoon aanwezig zijn', taal: 'T' },
    b: { tekst: 'Veel knuffelen en fysiek dichtbij zijn', taal: 'A' } },
  { vraag: 'Ik merk dat iemand van mij houdt als...',
    a: { tekst: 'Ze tijd vrijmaken, ook als het druk is', taal: 'T' },
    b: { tekst: 'Ze dingen voor mij doen zonder dat ik erom vraag', taal: 'D' } },
  { vraag: 'Ik voel me het meest verbonden als iemand...',
    a: { tekst: 'Echt aanwezig is als ik dat nodig heb', taal: 'T' },
    b: { tekst: 'Aan mij denkt met een attent kadootje', taal: 'C' } },
  { vraag: 'Bij stress heb ik meer behoefte aan...',
    a: { tekst: 'Een knuffel of geruststellende aanraking', taal: 'A' },
    b: { tekst: 'Dat iemand een taak of probleem van mij overneemt', taal: 'D' } },
  { vraag: 'Als verrassing kies ik liever...',
    a: { tekst: 'Dat iemand mij vastpakt en zegt dat alles goed komt', taal: 'A' },
    b: { tekst: 'Een doordacht cadeau dat laat zien dat ze goed opletten', taal: 'C' } },
  { vraag: 'Ik voel me het meest verwend als...',
    a: { tekst: 'Iemand voor mij kookt of iets voor mij regelt', taal: 'D' },
    b: { tekst: 'Iemand iets meeneemt waarvan ik had gezegd dat ik het mooi vond', taal: 'C' } },
];

const LIEFDESTALEN = {
  W: { naam: 'Woorden van bevestiging', emoji: '💬', kleur: 0x5865f2, beschrijving: 'Jij bloeit op van complimenten, aanmoediging en lieve berichtjes.' },
  T: { naam: 'Kwaliteitsvolle tijd', emoji: '⏰', kleur: 0x57f287, beschrijving: 'Voor jou is echte, onverdeelde aandacht het mooiste cadeau.' },
  A: { naam: 'Lichamelijke aanraking', emoji: '🤗', kleur: 0xeb459e, beschrijving: 'Een knuffel zegt voor jou meer dan duizend woorden.' },
  D: { naam: 'Daden van dienst', emoji: '🛠️', kleur: 0xfee75c, beschrijving: 'Jij voelt liefde in daden – als iemand iets doet zonder dat jij erom vraagt.' },
  C: { naam: 'Cadeaus ontvangen', emoji: '🎁', kleur: 0xed4245, beschrijving: 'Jij waardeert de moeite en het nadenken achter een attent gebaar.' },
};

const liefdestaalSessies = new Map(); // userId -> { channelId, antwoorden, vraagIndex, timeout }

function buildLiefdestaalVraagEmbed(index) {
  const v = LIEFDESTAAL_VRAGEN[index];
  const voortgang = '█'.repeat(index) + '░'.repeat(LIEFDESTAAL_VRAGEN.length - index);
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`💕 Liefdestaal test — Vraag ${index + 1}/${LIEFDESTAAL_VRAGEN.length}`)
    .setDescription(`**${v.vraag}**\n\n🅰️ ${v.a.tekst}\n\n🅱️ ${v.b.tekst}`)
    .setFooter({ text: `Voortgang: ${voortgang}` });
}

function buildLiefdestaalButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lt_A').setLabel('🅰️ A').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lt_B').setLabel('🅱️ B').setStyle(ButtonStyle.Secondary),
  );
}

function buildLiefdestaalResultaatEmbed(user, antwoorden) {
  const scores = { W: 0, T: 0, A: 0, D: 0, C: 0 };
  antwoorden.forEach((keuze, i) => {
    const v = LIEFDESTAAL_VRAGEN[i];
    scores[keuze === 'A' ? v.a.taal : v.b.taal]++;
  });
  const gesorteerd = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const max = gesorteerd[0][1];
  const winnaars = gesorteerd.filter(([, s]) => s === max);
  const primair = LIEFDESTALEN[winnaars[0][0]];
  const scoresTekst = gesorteerd
    .map(([code, score]) => {
      const t = LIEFDESTALEN[code];
      const bar = '█'.repeat(score) + '░'.repeat(LIEFDESTAAL_VRAGEN.length - score);
      return `${t.emoji} **${t.naam}** \`${bar}\` ${score}`;
    })
    .join('\n');
  const titel = winnaars.length > 1
    ? winnaars.map(([c]) => `${LIEFDESTALEN[c].emoji} ${LIEFDESTALEN[c].naam}`).join(' & ')
    : `${primair.emoji} ${primair.naam}`;
  const naam = user.displayName ?? user.username;
  return new EmbedBuilder()
    .setColor(primair.kleur)
    .setTitle(`💕 Liefdestaal van ${naam}`)
    .setDescription(`**${titel}**\n\n${primair.beschrijving}\n\n${scoresTekst}`)
    .setFooter({ text: 'Gebaseerd op The 5 Love Languages van Gary Chapman' })
    .setTimestamp();
}

// ─── Nooit heb ik ─────────────────────────────────────────────────────────────

const NOOIT_STELLINGEN = [
  "Nooit heb ik gedaan alsof ik ziek was om ergens onderuit te komen",
  "Nooit heb ik iemand geblokkeerd na een date",
  "Nooit heb ik midden in de nacht iemand een berichtje gestuurd",
  "Nooit heb ik iemand gestalkt op social media",
  "Nooit heb ik iemand kwaad gesproken achter zijn/haar rug",
  "Nooit heb ik gelogen op mijn cv",
  "Nooit heb ik iets gekocht en de bon bewaard om het later terug te brengen",
  "Nooit heb ik gedanst op een tafel of bar",
  "Nooit heb ik een geheim verteld dat ik had beloofd te bewaren",
  "Nooit heb ik gedronken voor 12 uur 's middags",
  "Nooit heb ik iemand's dagboek of berichten gelezen",
  "Nooit heb ik gedaan alsof ik het druk had om iemand te vermijden",
  "Nooit heb ik mij voorgedaan als iemand anders online",
  "Nooit heb ik gehuild bij een romantische film",
  "Nooit heb ik iemand anders de schuld gegeven van iets wat ik deed",
  "Nooit heb ik ergens geslapen wat ik niet van plan was",
  "Nooit heb ik een vreemde gekust",
  "Nooit heb ik een ex midden in de nacht teruggebeld of -getsxt",
  "Nooit heb ik iets gedaan wat eigenlijk niet mocht maar er toch mee weggekomen",
  "Nooit heb ik gedaan alsof ik iemand niet zag om een gesprek te vermijden",
];

const nooitStemmen = new Map(); // sessionId -> { stelling, wel, nooit, timeout }

function buildNooitEmbed(stelling, wel, nooit) {
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('🍺 Nooit heb ik...')
    .setDescription(`**${stelling}**\n\nKlik op een knop om te stemmen. Klik nogmaals om je stem in te trekken.`)
    .setFooter({ text: `${wel.size + nooit.size} stem${wel.size + nooit.size === 1 ? '' : 'men'} uitgebracht` });
}

function buildNooitButtons(sessionId, welSize, nooitSize) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nooit_wel_${sessionId}`).setLabel(`🍺 Wel gedaan (${welSize})`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`nooit_nooit_${sessionId}`).setLabel(`✋ Nooit gedaan (${nooitSize})`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`nooit_sluit_${sessionId}`).setLabel('🔒 Sluit stemming').setStyle(ButtonStyle.Danger),
  );
}

// ─── Persoonlijkheidstest ──────────────────────────────────────────────────────

const PERSOONLIJKHEID_VRAGEN = [
  { vraag: 'Op een feestje...', a: { tekst: 'Maak ik makkelijk contact met mensen die ik niet ken', dim: 'E' }, b: { tekst: 'Blijf ik liever bij de mensen die ik al ken', dim: 'I' } },
  { vraag: 'Na een drukke dag laad ik op door...', a: { tekst: 'Af te spreken met vrienden of gezelligheid op te zoeken', dim: 'E' }, b: { tekst: 'Even alleen te zijn en rust te nemen', dim: 'I' } },
  { vraag: 'In groepsgesprekken...', a: { tekst: 'Neem ik graag het woord en praat ik mee', dim: 'E' }, b: { tekst: 'Luister ik liever en spreek ik wanneer het zinvol is', dim: 'I' } },
  { vraag: 'Bij een moeilijke beslissing...', a: { tekst: 'Weeg ik de feiten en logica af', dim: 'T' }, b: { tekst: 'Volg ik mijn gevoel en wat goed voelt', dim: 'F' } },
  { vraag: 'Als een vriend zijn hart lucht...', a: { tekst: 'Geef ik praktische adviezen', dim: 'T' }, b: { tekst: 'Luister ik en leef ik mee', dim: 'F' } },
  { vraag: 'Ik vind het belangrijker om...', a: { tekst: 'Eerlijk en direct te zijn, ook als het pijn doet', dim: 'T' }, b: { tekst: 'Rekening te houden met andermans gevoelens', dim: 'F' } },
  { vraag: 'Mijn weekend is het liefst...', a: { tekst: 'Van tevoren gepland met duidelijke afspraken', dim: 'J' }, b: { tekst: 'Spontaan ingevuld, we zien wel', dim: 'P' } },
  { vraag: 'Met deadlines...', a: { tekst: 'Streef ik ruim van tevoren af', dim: 'J' }, b: { tekst: 'Werk ik het best onder druk op het laatste moment', dim: 'P' } },
  { vraag: 'Mijn werkplek of kamer...', a: { tekst: 'Is netjes en georganiseerd', dim: 'J' }, b: { tekst: 'Is een creatieve chaos waar ik mijn weg in vind', dim: 'P' } },
];

const PERSOONLIJKHEID_TYPES = {
  ETJ: { naam: 'De Commandant', kleur: 0xed4245, beschrijving: 'Doelgericht, georganiseerd en direct. Jij weet wat je wil en gaat ervoor.' },
  EFJ: { naam: 'De Verbinder', kleur: 0x57f287, beschrijving: 'Warm, sociaal en empathisch. Jij houdt de groep bij elkaar.' },
  ETP: { naam: 'De Debater', kleur: 0xffa500, beschrijving: 'Nieuwsgierig, energiek en altijd in voor een goed argument.' },
  EFP: { naam: 'De Levensgenieter', kleur: 0xfee75c, beschrijving: 'Enthousiast, spontaan en altijd het middelpunt van de avond.' },
  ITJ: { naam: 'De Strateeg', kleur: 0x5865f2, beschrijving: 'Rustig, analytisch en planmatig. Jij denkt altijd drie stappen vooruit.' },
  IFJ: { naam: 'De Dromer', kleur: 0xeb459e, beschrijving: 'Diep, intuïtief en warmhartig. Jij ziet wat anderen niet zien.' },
  ITP: { naam: 'De Denker', kleur: 0x99aab5, beschrijving: 'Onafhankelijk, analytisch en vol verrassende invalshoeken.' },
  IFP: { naam: 'De Kunstenaar', kleur: 0x9b59b6, beschrijving: 'Creatief, authentiek en altijd trouw aan jezelf.' },
};

const persoonlijkheidSessies = new Map(); // userId -> { channelId, antwoorden, vraagIndex, timeout }

function buildPersoonlijkheidVraagEmbed(index) {
  const v = PERSOONLIJKHEID_VRAGEN[index];
  const voortgang = '█'.repeat(index) + '░'.repeat(PERSOONLIJKHEID_VRAGEN.length - index);
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🧠 Persoonlijkheidstest — Vraag ${index + 1}/${PERSOONLIJKHEID_VRAGEN.length}`)
    .setDescription(`**${v.vraag}**\n\n🅰️ ${v.a.tekst}\n\n🅱️ ${v.b.tekst}`)
    .setFooter({ text: `Voortgang: ${voortgang}` });
}

function buildPersoonlijkheidButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pt_A').setLabel('🅰️ A').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pt_B').setLabel('🅱️ B').setStyle(ButtonStyle.Secondary),
  );
}

function buildPersoonlijkheidResultaatEmbed(user, antwoorden) {
  const scores = { E: 0, I: 0, T: 0, F: 0, J: 0, P: 0 };
  antwoorden.forEach((keuze, i) => {
    scores[keuze === 'A' ? PERSOONLIJKHEID_VRAGEN[i].a.dim : PERSOONLIJKHEID_VRAGEN[i].b.dim]++;
  });
  const type = (scores.E >= scores.I ? 'E' : 'I') + (scores.T >= scores.F ? 'T' : 'F') + (scores.J >= scores.P ? 'J' : 'P');
  const info = PERSOONLIJKHEID_TYPES[type];
  const naam = user.displayName ?? user.username;
  const scoresTekst = [
    `E ${'█'.repeat(scores.E)}${'░'.repeat(3 - scores.E)} | ${'░'.repeat(3 - scores.I)}${'█'.repeat(scores.I)} I`,
    `T ${'█'.repeat(scores.T)}${'░'.repeat(3 - scores.T)} | ${'░'.repeat(3 - scores.F)}${'█'.repeat(scores.F)} F`,
    `J ${'█'.repeat(scores.J)}${'░'.repeat(3 - scores.J)} | ${'░'.repeat(3 - scores.P)}${'█'.repeat(scores.P)} P`,
  ].join('\n');
  return new EmbedBuilder()
    .setColor(info.kleur)
    .setTitle(`🧠 Persoonlijkheid van ${naam}: ${type}`)
    .setDescription(`**${info.naam}**\n\n${info.beschrijving}\n\`\`\`${scoresTekst}\`\`\``)
    .setFooter({ text: 'Geïnspireerd op Myers-Briggs Type Indicator (MBTI)' })
    .setTimestamp();
}

// ─── Relatietest ───────────────────────────────────────────────────────────────

const RELATIE_VRAGEN = [
  { vraag: 'Liever...', a: 'Rustige avond thuis', b: 'Avond vol gezelligheid met vrienden' },
  { vraag: 'Liever...', a: 'Strand en zon', b: 'Bergen en natuur' },
  { vraag: 'Liever...', a: 'Alles van tevoren plannen', b: 'Spontaan beslissen' },
  { vraag: 'Liever...', a: 'Een film kijken', b: 'Een spelletje spelen' },
  { vraag: 'Liever...', a: 'Vroeg opstaan en de ochtend benutten', b: 'Lang uitslapen en rustig beginnen' },
  { vraag: 'Liever...', a: 'Romantisch diner buiten de deur', b: 'Gezellig thuis samen koken' },
  { vraag: 'Liever...', a: 'Zekerheid en stabiliteit', b: 'Avontuur en nieuwe ervaringen' },
  { vraag: 'Liever...', a: 'Praten over gevoelens', b: 'Problemen direct aanpakken' },
  { vraag: 'Liever...', a: 'Weinig, hechte vriendschappen', b: 'Groot netwerk met veel contacten' },
  { vraag: 'Liever...', a: 'Strandvakantie', b: 'Stedentrip of actieve vakantie' },
];

const RELATIE_SCORES = [
  { min: 9, tekst: '💑 Zielsverbonden! Jullie zijn op vrijwel alles hetzelfde afgestemd.' },
  { min: 7, tekst: '💕 Super goed op elkaar afgestemd! Jullie denken op de meeste dingen hetzelfde.' },
  { min: 5, tekst: '⚡ Een mooie mix! Jullie lijken op sommige dingen maar zijn op andere compleet anders.' },
  { min: 3, tekst: '🤔 Tegengestelden trekken aan. Jullie hebben genoeg om over te praten.' },
  { min: 0, tekst: '😅 Compleet tegengesteld — of juist perfect voor elkaar?' },
];

const relatieSessies = new Map(); // sessionId -> { channelId, speler1, speler2, timeout }
const relatieSpelers = new Map(); // userId -> sessionId

function buildRelatieVraagEmbed(index, naam) {
  const v = RELATIE_VRAGEN[index];
  const voortgang = '█'.repeat(index) + '░'.repeat(RELATIE_VRAGEN.length - index);
  return new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle(`💑 Relatietest — Vraag ${index + 1}/${RELATIE_VRAGEN.length}`)
    .setDescription(`**${v.vraag}**\n\n🅰️ ${v.a}\n\n🅱️ ${v.b}`)
    .setFooter({ text: `${naam} • Voortgang: ${voortgang}` });
}

function buildRelatieButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rt_A_${sessionId}`).setLabel('🅰️ A').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rt_B_${sessionId}`).setLabel('🅱️ B').setStyle(ButtonStyle.Secondary),
  );
}

function buildRelatieResultaatEmbed(s) {
  const matches = RELATIE_VRAGEN.map((_, i) => s.speler1.antwoorden[i] === s.speler2.antwoorden[i]);
  const score = matches.filter(Boolean).length;
  const pct = Math.round(score / RELATIE_VRAGEN.length * 100);
  const scoreInfo = RELATIE_SCORES.find(r => score >= r.min);
  const matchBar = matches.map(m => m ? '✅' : '❌').join(' ');
  const kleur = score >= 7 ? 0xeb459e : score >= 5 ? 0xfee75c : 0x5865f2;
  return new EmbedBuilder()
    .setColor(kleur)
    .setTitle(`💑 ${s.speler1.naam} & ${s.speler2.naam} — ${pct}% Match`)
    .setDescription(`${scoreInfo.tekst}\n\n${matchBar}\n\n**${score}/${RELATIE_VRAGEN.length}** vragen hetzelfde beantwoord`)
    .setTimestamp();
}

// ─── Beurtrotatie ──────────────────────────────────────────────────────────────

function getHuidigeSpelerNaam(guildId) {
  const b = getBeurten(guildId);
  if (b.lijst.length === 0) return null;
  return b.lijst[b.huidig].naam;
}

function advanceerBeurt(guildId) {
  const b = getBeurten(guildId);
  if (b.lijst.length === 0) return null;
  b.huidig = (b.huidig + 1) % b.lijst.length;
  return b.lijst[b.huidig];
}

function buildBeurtenLijstTekst(guildId) {
  const b = getBeurten(guildId);
  return b.lijst
    .map((s, i) => `${i === b.huidig ? "▶️" : `${i + 1}.`} **${s.naam}**`)
    .join("\n");
}

// ─── Bot Setup ─────────────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName("wod")
    .setDescription("Start een ronde Waarheid of Doen!")
    .addUserOption(opt =>
      opt.setName("speler").setDescription("Richt de vraag op een specifieke speler.").setRequired(false)
    ).toJSON(),
  new SlashCommandBuilder()
    .setName("waarheid")
    .setDescription("Krijg direct een waarheidsvraag.")
    .addIntegerOption(opt =>
      opt.setName("nummer").setDescription("Optioneel: vraag een specifieke vraag op via nummer (zie /lijst).").setRequired(false).setMinValue(1)
    ).toJSON(),
  new SlashCommandBuilder()
    .setName("doen")
    .setDescription("Krijg direct een doe-opdracht.")
    .addIntegerOption(opt =>
      opt.setName("nummer").setDescription("Optioneel: vraag een specifieke opdracht op via nummer (zie /lijst).").setRequired(false).setMinValue(1)
    ).toJSON(),
  new SlashCommandBuilder()
    .setName("beurt")
    .setDescription("Beheer de beurtrotatie.")
    .addSubcommand(sub => sub.setName("toevoegen").setDescription("Voeg een speler toe aan de rotatie.").addUserOption(opt => opt.setName("speler").setDescription("De toe te voegen speler.").setRequired(true)))
    .addSubcommand(sub => sub.setName("verwijder").setDescription("Verwijder een speler uit de rotatie.").addUserOption(opt => opt.setName("speler").setDescription("De te verwijderen speler.").setRequired(true)))
    .addSubcommand(sub => sub.setName("lijst").setDescription("Bekijk de huidige rotatie."))
    .addSubcommand(sub => sub.setName("reset").setDescription("Wis de rotatie."))
    .addSubcommand(sub => sub.setName("volgende").setDescription("Sla de huidige speler over en ga naar de volgende."))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("liefdestaal")
    .setDescription("Doe een korte liefdestaaltest en ontdek jouw liefdestaal!")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("nooit")
    .setDescription("Doe een ronde 'Nooit heb ik...' met de groep!")
    .addStringOption(opt =>
      opt.setName("stelling").setDescription("De stelling (optioneel, anders kiest de bot er een)").setRequired(false)
    ).toJSON(),
  new SlashCommandBuilder()
    .setName("persoonlijkheid")
    .setDescription("Doe een korte persoonlijkheidstest en ontdek jouw type!")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("relatietest")
    .setDescription("Test hoe goed jij en een andere speler bij elkaar passen!")
    .addUserOption(opt =>
      opt.setName("speler").setDescription("De speler waarmee je de test doet").setRequired(true)
    ).toJSON(),
  new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Reset de gebruikte vragen voor deze server. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset de gebruikte vragen en statistieken voor een nieuwe avond. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("statistieken")
    .setDescription("Bekijk de statistieken van deze sessie.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("voeg-toe")
    .setDescription("Voeg een nieuwe vraag of opdracht toe. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("type").setDescription("Waarheid of doen?").setRequired(true)
        .addChoices({ name: "Waarheid", value: "waarheid" }, { name: "Doen", value: "doen" })
    )
    .addStringOption(opt =>
      opt.setName("tekst").setDescription("De tekst van de vraag of opdracht.").setRequired(true)
    ).toJSON(),
  new SlashCommandBuilder()
    .setName("verwijder")
    .setDescription("Verwijder een vraag of opdracht. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("type").setDescription("Waarheid of doen?").setRequired(true)
        .addChoices({ name: "Waarheid", value: "waarheid" }, { name: "Doen", value: "doen" })
    )
    .addIntegerOption(opt =>
      opt.setName("nummer").setDescription("Het nummer van de vraag (gebruik /lijst om nummers te zien).").setRequired(true).setMinValue(1)
    ).toJSON(),
  new SlashCommandBuilder()
    .setName("lijst")
    .setDescription("Bekijk alle huidige vragen en opdrachten. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("type").setDescription("Waarheid, doen, of allebei?").setRequired(false)
        .addChoices({ name: "Waarheid", value: "waarheid" }, { name: "Doen", value: "doen" })
    ).toJSON(),
];

// ─── Migratie van JSON naar SQLite ─────────────────────────────────────────────

function migrateFromJSON() {
  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length === 0) return;

  const existingCount = db.prepare("SELECT COUNT(*) AS cnt FROM vragen").get().cnt;
  if (existingCount === 0 && existsSync(VRAGEN_PAD)) {
    try {
      const data = JSON.parse(readFileSync(VRAGEN_PAD, "utf-8"));
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
      console.error("❌ Migratie vragen.json mislukt:", err.message);
    }
  }

  if (existsSync(INSTELLINGEN_PAD)) {
    try {
      const data = JSON.parse(readFileSync(INSTELLINGEN_PAD, "utf-8"));
      guildIds.forEach(guildId => {
        db.prepare("INSERT OR IGNORE INTO instellingen (guild_id, cooldown_ms, dm_modus) VALUES (?, ?, ?)")
          .run(guildId, data.cooldownMs ?? 1500, data.dmModus ? 1 : 0);
      });
      console.log(`✅ Instellingen gemigreerd naar ${guildIds.length} server(s).`);
    } catch (err) {
      console.error("❌ Migratie settings.json mislukt:", err.message);
    }
  }
}

client.once("ready", async () => {
  console.log(`✅ Ingelogd als ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  // Globale registratie
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Globale slash commands geregistreerd!");
  } catch (err) {
    console.error("❌ Fout bij registreren van globale commands:", err.message);
  }

  // Guild-specifieke registratie voor directe beschikbaarheid
  for (const [guildId] of client.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
      console.log(`✅ Guild commands geregistreerd voor ${client.guilds.cache.get(guildId)?.name} (${guildId})`);
    } catch (err) {
      console.error(`❌ Guild command registratie mislukt voor ${guildId}:`, err.message);
    }
  }

  migrateFromJSON();
});

// ─── Embed Helpers ─────────────────────────────────────────────────────────────

function buildKiesEmbed(user, doelNaam = null) {
  const naam = doelNaam ?? user.displayName;
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("🎮 Waarheid of Doen")
    .setDescription(`Het is **${naam}**'s beurt! Kies een optie hieronder.`)
    .setFooter({ text: "Waarheid of Doen • Durf jij het aan?" });
}

function buildWaarheidEmbed(vraagTekst, user, guildId, isReroll = false) {
  const totaal = stmts.countVragen.get(guildId, 'waarheid').cnt;
  const gebruiktCount = getGebruikte(guildId, 'waarheid').size;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(isReroll ? "🔵 Waarheid — Reroll" : "🔵 Waarheid")
    .setDescription(`**${user.displayName}**, beantwoord eerlijk:\n\n> ${vraagTekst}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruiktCount}/${totaal} vragen gehad` })
    .setTimestamp();
}

function buildDoenEmbed(opdrachtTekst, user, guildId, isReroll = false) {
  const totaal = stmts.countVragen.get(guildId, 'doen').cnt;
  const gebruiktCount = getGebruikte(guildId, 'doen').size;
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(isReroll ? "🔴 Doen — Reroll" : "🔴 Doen")
    .setDescription(`**${user.displayName}**, jouw opdracht:\n\n> ${opdrachtTekst}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruiktCount}/${totaal} opdrachten gehad` })
    .setTimestamp();
}

function buildStrafWaarheidEmbed(vraagTekst, user, guildId) {
  const totaal = stmts.countVragen.get(guildId, 'waarheid').cnt;
  const gebruiktCount = getGebruikte(guildId, 'waarheid').size;
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("🔵 Waarheid — Strafvraag")
    .setDescription(`**${user.displayName}** heeft gepast! Hier is je strafvraag:\n\n> ${vraagTekst}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruiktCount}/${totaal} vragen gehad` })
    .setTimestamp();
}

function buildStrafDoenEmbed(opdrachtTekst, user, guildId) {
  const totaal = stmts.countVragen.get(guildId, 'doen').cnt;
  const gebruiktCount = getGebruikte(guildId, 'doen').size;
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("🔴 Doen — Strafopdracht")
    .setDescription(`**${user.displayName}** heeft gepast! Hier is je strafopdracht:\n\n> ${opdrachtTekst}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruiktCount}/${totaal} opdrachten gehad` })
    .setTimestamp();
}

function buildKiesButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("kies_waarheid").setLabel("🔵 Waarheid").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("kies_doen").setLabel("🔴 Doen").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("kies_random").setLabel("🎲 Verrassing!").setStyle(ButtonStyle.Secondary)
  );
}

function buildDisabledKiesButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("kies_waarheid").setLabel("🔵 Waarheid").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("kies_doen").setLabel("🔴 Doen").setStyle(ButtonStyle.Danger).setDisabled(true),
    new ButtonBuilder().setCustomId("kies_random").setLabel("🎲 Verrassing!").setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
}

function buildActieButtons(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reroll_${type}`).setLabel("🎲 Reroll").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`passen_${type}`).setLabel("❌ Passen").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("nieuwe_ronde").setLabel("🔄 Nieuwe ronde").setStyle(ButtonStyle.Success)
  );
}

function buildStatistiekenEmbed(guildId) {
  const stats = getSessie(guildId);
  const totaal = stats.aantalWaarheid + stats.aantalDoen;
  const duur = Math.floor((new Date() - stats.sessieStart) / 60000);
  const uren = Math.floor(duur / 60);
  const minuten = duur % 60;
  const duurTekst = uren > 0 ? `${uren}u ${minuten}m` : `${minuten}m`;
  const rerollLijst = [...stats.rerollTeller.entries()]
    .sort((a, b) => b[1].teller - a[1].teller)
    .map(([, data], i) => `**${i + 1}.** ${data.naam} — ${data.teller}x reroll`)
    .join("\n");
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("📊 Statistieken")
    .addFields(
      { name: "⏱️ Sessieduur", value: duurTekst, inline: true },
      { name: "🎮 Totaal gespeeld", value: `${totaal} rondes`, inline: true },
      { name: "​", value: "​", inline: true },
      { name: "🔵 Waarheid", value: `${stats.aantalWaarheid}x`, inline: true },
      { name: "🔴 Doen", value: `${stats.aantalDoen}x`, inline: true },
      { name: "​", value: "​", inline: true },
      { name: "🎲 Reroll ranglijst", value: rerollLijst || "Nog niemand gererolld!", inline: false }
    )
    .setFooter({ text: `Sessie gestart om ${stats.sessieStart.toLocaleTimeString("nl-NL")}` })
    .setTimestamp();
}

function buildLijstEmbeds(guildId, type) {
  const lijst = stmts.getVragen.all(guildId, type);
  const kleur = type === "waarheid" ? 0x5865f2 : 0xed4245;
  const emoji = type === "waarheid" ? "🔵" : "🔴";
  const label = type === "waarheid" ? "Waarheidsvragen" : "Doe-opdrachten";
  if (lijst.length === 0) {
    return [new EmbedBuilder().setColor(kleur).setTitle(`${emoji} ${label}`).setDescription("Geen vragen gevonden.")];
  }
  const embeds = [];
  let huidigeTekst = "";
  let startNummer = 1;
  for (let i = 0; i < lijst.length; i++) {
    const regel = `**${i + 1}.** ${lijst[i].tekst}\n`;
    if (huidigeTekst.length + regel.length > 3800) {
      embeds.push(new EmbedBuilder().setColor(kleur).setTitle(`${emoji} ${label} (${startNummer}–${i})`).setDescription(huidigeTekst.trim()));
      huidigeTekst = regel;
      startNummer = i + 1;
    } else {
      huidigeTekst += regel;
    }
  }
  embeds.push(
    new EmbedBuilder()
      .setColor(kleur)
      .setTitle(embeds.length === 0 ? `${emoji} ${label}` : `${emoji} ${label} (${startNummer}–${lijst.length})`)
      .setDescription(huidigeTekst.trim())
      .setFooter({ text: `Totaal: ${lijst.length}` })
  );
  return embeds;
}

// ─── Interaction Handler ───────────────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (!interaction.guildId) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: '❌ Deze bot werkt alleen in servers.', ephemeral: true });
    }
    return;
  }

  const guildId = interaction.guildId;
  const user = interaction.member ?? interaction.user;

  // ── Slash Commands ──
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "wod") {
      const doelLid = interaction.options.getMember("speler");
      let doelNaam = null;
      if (doelLid) {
        doelNaam = doelLid.displayName;
      } else {
        doelNaam = getHuidigeSpelerNaam(guildId);
      }
      await interaction.reply({ embeds: [buildKiesEmbed(user, doelNaam)], components: [buildKiesButtons()] });
      return;
    }

    if (interaction.commandName === "waarheid") {
      const nummer = interaction.options.getInteger("nummer");
      if (nummer !== null) {
        const vragen = stmts.getVragen.all(guildId, 'waarheid');
        if (nummer > vragen.length) {
          await interaction.reply({ content: `❌ Er is geen waarheidsvraag met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
          return;
        }
        const vraag = vragen[nummer - 1];
        getGebruikte(guildId, 'waarheid').add(vraag.id);
        getSessie(guildId).aantalWaarheid++;
        const inst = dbGetInstellingen(guildId);
        if (inst.dmModus || vraag.dm_modus) {
          try {
            await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)] });
            await interaction.reply({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
          } catch {
            await interaction.reply({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
          }
        } else {
          await interaction.reply({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        const vraag = getVraag(guildId, 'waarheid');
        if (!vraag) {
          await interaction.reply({ content: '❌ Er zijn geen waarheidsvragen. Voeg ze toe via het admin panel.', ephemeral: true });
          return;
        }
        getSessie(guildId).aantalWaarheid++;
        const inst = dbGetInstellingen(guildId);
        if (inst.dmModus || vraag.dm_modus) {
          try {
            await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)] });
            await interaction.reply({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
          } catch {
            await interaction.reply({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
          }
        } else {
          await interaction.reply({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
        }
      }
      return;
    }

    if (interaction.commandName === "doen") {
      const nummer = interaction.options.getInteger("nummer");
      if (nummer !== null) {
        const opdrachten = stmts.getVragen.all(guildId, 'doen');
        if (nummer > opdrachten.length) {
          await interaction.reply({ content: `❌ Er is geen doe-opdracht met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
          return;
        }
        const opdracht = opdrachten[nummer - 1];
        getGebruikte(guildId, 'doen').add(opdracht.id);
        getSessie(guildId).aantalDoen++;
        const inst = dbGetInstellingen(guildId);
        if (inst.dmModus || opdracht.dm_modus) {
          try {
            await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)] });
            await interaction.reply({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
          } catch {
            await interaction.reply({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
          }
        } else {
          await interaction.reply({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
        }
      } else {
        const opdracht = getVraag(guildId, 'doen');
        if (!opdracht) {
          await interaction.reply({ content: '❌ Er zijn geen doe-opdrachten. Voeg ze toe via het admin panel.', ephemeral: true });
          return;
        }
        getSessie(guildId).aantalDoen++;
        const inst = dbGetInstellingen(guildId);
        if (inst.dmModus || opdracht.dm_modus) {
          try {
            await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)] });
            await interaction.reply({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
          } catch {
            await interaction.reply({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
          }
        } else {
          await interaction.reply({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
        }
      }
      return;
    }

    if (interaction.commandName === "beurt") {
      const sub = interaction.options.getSubcommand();
      const b = getBeurten(guildId);

      if (sub === "toevoegen") {
        const doelUser = interaction.options.getUser("speler");
        const doelLid = interaction.options.getMember("speler");
        const naam = doelLid?.displayName ?? doelUser.username;
        if (b.lijst.some(s => s.id === doelUser.id)) {
          await interaction.reply({ content: `**${naam}** staat al in de rotatie.`, ephemeral: true });
          return;
        }
        b.lijst.push({ id: doelUser.id, naam });
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Speler toegevoegd")
            .setDescription(`**${naam}** is toegevoegd aan de rotatie.\n\n${buildBeurtenLijstTekst(guildId)}`).setTimestamp()],
        });
        return;
      }

      if (sub === "verwijder") {
        const doelUser = interaction.options.getUser("speler");
        const idx = b.lijst.findIndex(s => s.id === doelUser.id);
        if (idx === -1) {
          await interaction.reply({ content: "Die speler staat niet in de rotatie.", ephemeral: true });
          return;
        }
        const verwijderd = b.lijst.splice(idx, 1)[0];
        if (b.huidig >= b.lijst.length) b.huidig = 0;
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Speler verwijderd")
            .setDescription(`**${verwijderd.naam}** is verwijderd uit de rotatie.${b.lijst.length > 0 ? `\n\n${buildBeurtenLijstTekst(guildId)}` : ""}`).setTimestamp()],
        });
        return;
      }

      if (sub === "lijst") {
        if (b.lijst.length === 0) {
          await interaction.reply({ content: "De rotatie is leeg. Voeg spelers toe met `/beurt toevoegen`.", ephemeral: true });
          return;
        }
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle("🔄 Beurtrotatie").setDescription(buildBeurtenLijstTekst(guildId)).setTimestamp()],
        });
        return;
      }

      if (sub === "reset") {
        b.lijst.length = 0;
        b.huidig = 0;
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Rotatie gewist").setDescription("De beurtrotatie is gewist.").setTimestamp()],
        });
        return;
      }

      if (sub === "volgende") {
        if (b.lijst.length === 0) {
          await interaction.reply({ content: "De rotatie is leeg.", ephemeral: true });
          return;
        }
        const volgende = advanceerBeurt(guildId);
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle("🔄 Volgende speler")
            .setDescription(`Het is nu **${volgende.naam}**'s beurt!\n\n${buildBeurtenLijstTekst(guildId)}`).setTimestamp()],
        });
        return;
      }
    }

    if (interaction.commandName === "nooit") {
      const invoer = interaction.options.getString("stelling");
      const stelling = invoer?.trim() || NOOIT_STELLINGEN[Math.floor(Math.random() * NOOIT_STELLINGEN.length)];
      const sessionId = interaction.id;
      const timeout = setTimeout(() => nooitStemmen.delete(sessionId), 2 * 60 * 60 * 1000);
      nooitStemmen.set(sessionId, { stelling, wel: new Map(), nooit: new Map(), timeout });
      await interaction.reply({
        embeds: [buildNooitEmbed(stelling, new Map(), new Map())],
        components: [buildNooitButtons(sessionId, 0, 0)],
      });
      return;
    }

    if (interaction.commandName === "persoonlijkheid") {
      const userId = interaction.user.id;
      if (persoonlijkheidSessies.has(userId)) {
        await interaction.reply({ content: '❌ Je bent al bezig met een persoonlijkheidstest!', ephemeral: true });
        return;
      }
      const timeout = setTimeout(() => persoonlijkheidSessies.delete(userId), 10 * 60 * 1000);
      persoonlijkheidSessies.set(userId, { channelId: interaction.channelId, antwoorden: [], vraagIndex: 0, timeout });
      await interaction.reply({ embeds: [buildPersoonlijkheidVraagEmbed(0)], components: [buildPersoonlijkheidButtons()], ephemeral: true });
      return;
    }

    if (interaction.commandName === "relatietest") {
      const userId = interaction.user.id;
      const targetUser = interaction.options.getUser("speler");
      const targetLid = interaction.options.getMember("speler");
      if (targetUser.id === userId) {
        await interaction.reply({ content: '❌ Je kunt geen relatietest doen met jezelf!', ephemeral: true });
        return;
      }
      if (targetUser.bot) {
        await interaction.reply({ content: '❌ Je kunt geen relatietest doen met een bot!', ephemeral: true });
        return;
      }
      if (relatieSpelers.has(userId) || relatieSpelers.has(targetUser.id)) {
        await interaction.reply({ content: '❌ Eén van jullie doet al mee aan een relatietest.', ephemeral: true });
        return;
      }
      const sessionId = interaction.id;
      const initiatorNaam = user.displayName ?? interaction.user.username;
      const targetNaam = targetLid?.displayName ?? targetUser.username;
      const timeout = setTimeout(() => {
        const s = relatieSessies.get(sessionId);
        if (s) { relatieSpelers.delete(s.speler1.id); relatieSpelers.delete(s.speler2.id); }
        relatieSessies.delete(sessionId);
      }, 15 * 60 * 1000);
      relatieSessies.set(sessionId, {
        channelId: interaction.channelId,
        speler1: { id: userId, naam: initiatorNaam, antwoorden: [] },
        speler2: { id: targetUser.id, naam: targetNaam, antwoorden: [] },
        timeout,
      });
      relatieSpelers.set(userId, sessionId);
      relatieSpelers.set(targetUser.id, sessionId);
      await interaction.reply({ embeds: [buildRelatieVraagEmbed(0, initiatorNaam)], components: [buildRelatieButtons(sessionId)], ephemeral: true });
      await interaction.followUp({
        embeds: [new EmbedBuilder()
          .setColor(0xeb459e)
          .setTitle('💑 Relatietest uitdaging!')
          .setDescription(`**${initiatorNaam}** daagt **${targetNaam}** uit voor een relatietest!\n\n<@${targetUser.id}>, klik op de knop om jouw vragen te beantwoorden.`)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`rt_start_${sessionId}`).setLabel('▶️ Start mijn test').setStyle(ButtonStyle.Primary)
        )],
      });
      return;
    }

    if (interaction.commandName === "liefdestaal") {
      const userId = interaction.user.id;
      if (liefdestaalSessies.has(userId)) {
        await interaction.reply({ content: '❌ Je bent al bezig met een liefdestaaltest! Beantwoord de openstaande vraag eerst.', ephemeral: true });
        return;
      }
      const timeout = setTimeout(() => liefdestaalSessies.delete(userId), 10 * 60 * 1000);
      liefdestaalSessies.set(userId, { channelId: interaction.channelId, antwoorden: [], vraagIndex: 0, timeout });
      await interaction.reply({ embeds: [buildLiefdestaalVraagEmbed(0)], components: [buildLiefdestaalButtons()], ephemeral: true });
      return;
    }

    if (interaction.commandName === "statistieken") {
      await interaction.reply({ embeds: [buildStatistiekenEmbed(guildId)] });
      return;
    }

    if (interaction.commandName === "reset") {
      getGebruikte(guildId, 'waarheid').clear();
      getGebruikte(guildId, 'doen').clear();
      sessieData.delete(guildId);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Reset voltooid")
          .setDescription("Alle gebruikte vragen en statistieken zijn gereset. Veel speelplezier! 🎉")
          .setTimestamp()],
      });
      return;
    }

    if (interaction.commandName === "reload") {
      getGebruikte(guildId, 'waarheid').clear();
      getGebruikte(guildId, 'doen').clear();
      const waarheidCount = stmts.countVragen.get(guildId, 'waarheid').cnt;
      const doenCount = stmts.countVragen.get(guildId, 'doen').cnt;
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Vragen gereset")
          .setDescription(`Gebruikte vragen gereset.\n\n📋 **${waarheidCount}** waarheidsvragen\n🎯 **${doenCount}** doe-opdrachten`)
          .setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "voeg-toe") {
      const type = interaction.options.getString("type");
      const tekst = interaction.options.getString("tekst").trim();
      stmts.insertVraag.run(guildId, type, tekst, 'algemeen', 0);
      const count = stmts.countVragen.get(guildId, type).cnt;
      const label = type === "waarheid" ? "waarheidsvraag" : "doe-opdracht";
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Toegevoegd")
          .setDescription(`Nieuwe ${label} toegevoegd als #${count}:\n\n> ${tekst}`)
          .setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "verwijder") {
      const type = interaction.options.getString("type");
      const nummer = interaction.options.getInteger("nummer");
      const vragen = stmts.getVragen.all(guildId, type);
      const label = type === "waarheid" ? "waarheidsvraag" : "doe-opdracht";
      if (nummer > vragen.length) {
        await interaction.reply({
          content: `❌ Er is geen ${label} met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`,
          ephemeral: true,
        });
        return;
      }
      const vraag = vragen[nummer - 1];
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("⚠️ Bevestig verwijdering")
          .setDescription(`Weet je zeker dat je ${label} #${nummer} wilt verwijderen?\n\n> ${vraag.tekst}`)
          .setTimestamp()],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`verwijder_ja_${vraag.id}`).setLabel("🗑️ Ja, verwijder").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("verwijder_nee").setLabel("❌ Annuleer").setStyle(ButtonStyle.Secondary)
        )],
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "lijst") {
      const type = interaction.options.getString("type");
      if (!type) {
        const alleEmbeds = [...buildLijstEmbeds(guildId, "waarheid"), ...buildLijstEmbeds(guildId, "doen")].slice(0, 10);
        await interaction.reply({ embeds: alleEmbeds, ephemeral: true });
      } else {
        await interaction.reply({ embeds: buildLijstEmbeds(guildId, type), ephemeral: true });
      }
      return;
    }
  }

  // ── Buttons ──
  if (interaction.isButton()) {
    if (inCooldown(user.id ?? interaction.user.id, guildId)) return;

    if (interaction.customId === "kies_waarheid") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      const vraag = getVraag(guildId, 'waarheid');
      if (!vraag) { await interaction.followUp({ content: '❌ Geen waarheidsvragen beschikbaar.', ephemeral: true }); return; }
      getSessie(guildId).aantalWaarheid++;
      const inst = dbGetInstellingen(guildId);
      if (inst.dmModus || vraag.dm_modus) {
        try {
          await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)] });
          await interaction.followUp({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
        } catch {
          await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.customId === "kies_doen") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      const opdracht = getVraag(guildId, 'doen');
      if (!opdracht) { await interaction.followUp({ content: '❌ Geen doe-opdrachten beschikbaar.', ephemeral: true }); return; }
      getSessie(guildId).aantalDoen++;
      const inst = dbGetInstellingen(guildId);
      if (inst.dmModus || opdracht.dm_modus) {
        try {
          await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)] });
          await interaction.followUp({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
        } catch {
          await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.customId === "kies_random") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      const inst = dbGetInstellingen(guildId);
      if (Math.random() < 0.5) {
        const vraag = getVraag(guildId, 'waarheid');
        if (!vraag) { await interaction.followUp({ content: '❌ Geen waarheidsvragen beschikbaar.', ephemeral: true }); return; }
        getSessie(guildId).aantalWaarheid++;
        if (inst.dmModus || vraag.dm_modus) {
          try {
            await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)] });
            await interaction.followUp({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
          } catch {
            await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
          }
        } else {
          await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        const opdracht = getVraag(guildId, 'doen');
        if (!opdracht) { await interaction.followUp({ content: '❌ Geen doe-opdrachten beschikbaar.', ephemeral: true }); return; }
        getSessie(guildId).aantalDoen++;
        if (inst.dmModus || opdracht.dm_modus) {
          try {
            await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)] });
            await interaction.followUp({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
          } catch {
            await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
          }
        } else {
          await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
        }
      }
      return;
    }

    if (interaction.customId === "reroll_waarheid") {
      const stats = getSessie(guildId);
      const huidig = stats.rerollTeller.get(user.id ?? interaction.user.id) ?? { naam: user.displayName, teller: 0 };
      stats.rerollTeller.set(user.id ?? interaction.user.id, { naam: user.displayName, teller: huidig.teller + 1 });
      const vraag = getVraag(guildId, 'waarheid');
      if (!vraag) { await interaction.reply({ content: '❌ Geen waarheidsvragen beschikbaar.', ephemeral: true }); return; }
      await interaction.deferUpdate();
      await interaction.message.delete();
      const inst = dbGetInstellingen(guildId);
      if (inst.dmModus || vraag.dm_modus) {
        try {
          await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId, true)] });
          await interaction.followUp({ content: `📩 Reroll verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
        } catch {
          await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId, true)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, guildId, true)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.customId === "reroll_doen") {
      const stats = getSessie(guildId);
      const huidig = stats.rerollTeller.get(user.id ?? interaction.user.id) ?? { naam: user.displayName, teller: 0 };
      stats.rerollTeller.set(user.id ?? interaction.user.id, { naam: user.displayName, teller: huidig.teller + 1 });
      const opdracht = getVraag(guildId, 'doen');
      if (!opdracht) { await interaction.reply({ content: '❌ Geen doe-opdrachten beschikbaar.', ephemeral: true }); return; }
      await interaction.deferUpdate();
      await interaction.message.delete();
      const inst = dbGetInstellingen(guildId);
      if (inst.dmModus || opdracht.dm_modus) {
        try {
          await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId, true)] });
          await interaction.followUp({ content: `📩 Reroll verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
        } catch {
          await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId, true)], components: [buildActieButtons("doen")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, guildId, true)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.customId === "passen_waarheid") {
      const vraag = getVraag(guildId, 'waarheid');
      if (!vraag) { await interaction.reply({ content: '❌ Geen waarheidsvragen beschikbaar.', ephemeral: true }); return; }
      await interaction.deferUpdate();
      await interaction.message.delete();
      const inst = dbGetInstellingen(guildId);
      if (inst.dmModus || vraag.dm_modus) {
        try {
          await interaction.user.send({ embeds: [buildStrafWaarheidEmbed(vraag.tekst, user, guildId)] });
          await interaction.followUp({ content: `📩 Strafvraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
        } catch {
          await interaction.followUp({ embeds: [buildStrafWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildStrafWaarheidEmbed(vraag.tekst, user, guildId)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.customId === "passen_doen") {
      const opdracht = getVraag(guildId, 'doen');
      if (!opdracht) { await interaction.reply({ content: '❌ Geen doe-opdrachten beschikbaar.', ephemeral: true }); return; }
      await interaction.deferUpdate();
      await interaction.message.delete();
      const inst = dbGetInstellingen(guildId);
      if (inst.dmModus || opdracht.dm_modus) {
        try {
          await interaction.user.send({ embeds: [buildStrafDoenEmbed(opdracht.tekst, user, guildId)] });
          await interaction.followUp({ content: `📩 Strafopdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
        } catch {
          await interaction.followUp({ embeds: [buildStrafDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildStrafDoenEmbed(opdracht.tekst, user, guildId)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.customId.startsWith('nooit_')) {
      const delen = interaction.customId.split('_');
      const actie = delen[1];
      const sessionId = delen.slice(2).join('_');
      const sessie = nooitStemmen.get(sessionId);
      if (!sessie) { await interaction.reply({ content: 'Stemming verlopen.', ephemeral: true }); return; }
      const userId = interaction.user.id;
      const naam = interaction.member?.displayName ?? interaction.user.username;
      if (actie === 'sluit') {
        clearTimeout(sessie.timeout);
        nooitStemmen.delete(sessionId);
        const welNamen = [...sessie.wel.values()].join(', ') || 'niemand';
        const nooitNamen = [...sessie.nooit.values()].join(', ') || 'niemand';
        await interaction.update({
          embeds: [new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle('🍺 Nooit heb ik... — Uitslag')
            .setDescription(`**${sessie.stelling}**`)
            .addFields(
              { name: `🍺 Wel gedaan (${sessie.wel.size})`, value: welNamen, inline: true },
              { name: `✋ Nooit gedaan (${sessie.nooit.size})`, value: nooitNamen, inline: true }
            )
            .setTimestamp()],
          components: [],
        });
        return;
      }
      if (actie === 'wel') {
        if (sessie.wel.has(userId)) { sessie.wel.delete(userId); }
        else { sessie.wel.set(userId, naam); sessie.nooit.delete(userId); }
      } else {
        if (sessie.nooit.has(userId)) { sessie.nooit.delete(userId); }
        else { sessie.nooit.set(userId, naam); sessie.wel.delete(userId); }
      }
      await interaction.update({ components: [buildNooitButtons(sessionId, sessie.wel.size, sessie.nooit.size)] });
      return;
    }

    if (interaction.customId === 'pt_A' || interaction.customId === 'pt_B') {
      const userId = interaction.user.id;
      const sessie = persoonlijkheidSessies.get(userId);
      if (!sessie) { await interaction.update({ content: '❌ Sessie verlopen. Gebruik `/persoonlijkheid` om opnieuw te beginnen.', embeds: [], components: [] }); return; }
      sessie.antwoorden.push(interaction.customId === 'pt_A' ? 'A' : 'B');
      sessie.vraagIndex++;
      if (sessie.vraagIndex >= PERSOONLIJKHEID_VRAGEN.length) {
        clearTimeout(sessie.timeout);
        persoonlijkheidSessies.delete(userId);
        await interaction.update({ content: '✅ Test voltooid! Je resultaat wordt zo geplaatst...', embeds: [], components: [] });
        const kanaal = client.channels.cache.get(sessie.channelId);
        if (kanaal) await kanaal.send({ embeds: [buildPersoonlijkheidResultaatEmbed(user, sessie.antwoorden)] });
      } else {
        await interaction.update({ embeds: [buildPersoonlijkheidVraagEmbed(sessie.vraagIndex)], components: [buildPersoonlijkheidButtons()] });
      }
      return;
    }

    if (interaction.customId.startsWith('rt_')) {
      const delen = interaction.customId.split('_');
      const actie = delen[1];
      const sessionId = delen.slice(2).join('_');
      const sessie = relatieSessies.get(sessionId);
      if (!sessie) { await interaction.reply({ content: '❌ Sessie verlopen.', ephemeral: true }); return; }
      const userId = interaction.user.id;
      if (actie === 'start') {
        if (userId !== sessie.speler2.id) { await interaction.reply({ content: '❌ Deze uitdaging is niet voor jou.', ephemeral: true }); return; }
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0xeb459e).setTitle('💑 Relatietest gestart!').setDescription(`**${sessie.speler2.naam}** doet mee! De uitslag volgt zodra jullie allebei klaar zijn.`)],
          components: [],
        });
        await interaction.followUp({ embeds: [buildRelatieVraagEmbed(0, sessie.speler2.naam)], components: [buildRelatieButtons(sessionId)], ephemeral: true });
        return;
      }
      const isSpeler1 = userId === sessie.speler1.id;
      const isSpeler2 = userId === sessie.speler2.id;
      if (!isSpeler1 && !isSpeler2) { await interaction.reply({ content: '❌ Jij doet niet mee aan deze relatietest.', ephemeral: true }); return; }
      const speler = isSpeler1 ? sessie.speler1 : sessie.speler2;
      speler.antwoorden.push(actie === 'A' ? 'A' : 'B');
      if (speler.antwoorden.length >= RELATIE_VRAGEN.length) {
        await interaction.update({ content: '✅ Jouw antwoorden zijn opgeslagen! Wachten op de ander...', embeds: [], components: [] });
        if (sessie.speler1.antwoorden.length >= RELATIE_VRAGEN.length && sessie.speler2.antwoorden.length >= RELATIE_VRAGEN.length) {
          clearTimeout(sessie.timeout);
          relatieSpelers.delete(sessie.speler1.id);
          relatieSpelers.delete(sessie.speler2.id);
          relatieSessies.delete(sessionId);
          const kanaal = client.channels.cache.get(sessie.channelId);
          if (kanaal) await kanaal.send({ embeds: [buildRelatieResultaatEmbed(sessie)] });
        }
      } else {
        await interaction.update({ embeds: [buildRelatieVraagEmbed(speler.antwoorden.length, speler.naam)], components: [buildRelatieButtons(sessionId)] });
      }
      return;
    }

    if (interaction.customId === 'lt_A' || interaction.customId === 'lt_B') {
      const userId = interaction.user.id;
      const sessie = liefdestaalSessies.get(userId);
      if (!sessie) {
        await interaction.update({ content: '❌ Sessie verlopen. Gebruik `/liefdestaal` om opnieuw te beginnen.', embeds: [], components: [] });
        return;
      }
      sessie.antwoorden.push(interaction.customId === 'lt_A' ? 'A' : 'B');
      sessie.vraagIndex++;
      if (sessie.vraagIndex >= LIEFDESTAAL_VRAGEN.length) {
        clearTimeout(sessie.timeout);
        liefdestaalSessies.delete(userId);
        await interaction.update({ content: '✅ Test voltooid! Je uitslag wordt zo geplaatst...', embeds: [], components: [] });
        const kanaal = client.channels.cache.get(sessie.channelId);
        if (kanaal) await kanaal.send({ embeds: [buildLiefdestaalResultaatEmbed(user, sessie.antwoorden)] });
      } else {
        await interaction.update({ embeds: [buildLiefdestaalVraagEmbed(sessie.vraagIndex)], components: [buildLiefdestaalButtons()] });
      }
      return;
    }

    if (interaction.customId === "nieuwe_ronde") {
      let doelNaam = null;
      const b = getBeurten(guildId);
      if (b.lijst.length > 0) {
        doelNaam = advanceerBeurt(guildId).naam;
      }
      await interaction.update({ components: [] });
      await interaction.followUp({ embeds: [buildKiesEmbed(user, doelNaam)], components: [buildKiesButtons()] });
      return;
    }

    if (interaction.customId.startsWith("verwijder_ja_")) {
      const vraagId = parseInt(interaction.customId.replace("verwijder_ja_", ""));
      const vraag = db.prepare("SELECT * FROM vragen WHERE id = ? AND guild_id = ?").get(vraagId, guildId);
      if (!vraag) {
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Niet gevonden").setDescription("De vraag bestaat niet meer.").setTimestamp()],
          components: [],
        });
        return;
      }
      stmts.deleteVraagById.run(vraagId, guildId);
      getGebruikte(guildId, vraag.type).delete(vraagId);
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("🗑️ Verwijderd")
          .setDescription(`Vraag verwijderd:\n\n> ${vraag.tekst}`)
          .setTimestamp()],
        components: [],
      });
      return;
    }

    if (interaction.customId === "verwijder_nee") {
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Geannuleerd").setDescription("De verwijdering is geannuleerd.").setTimestamp()],
        components: [],
      });
      return;
    }
  }
});

// ─── Admin API Server ──────────────────────────────────────────────────────────

const app = express();
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || "3001");
const DISCORD_API = "https://discord.com/api/v10";

app.use(cors({ origin: (_, cb) => cb(null, config.frontendUrl), credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "changeme-zet-een-echt-secret-in-.env",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Niet ingelogd" });
  next();
}

function requireGuild(req, res, next) {
  if (!req.session.activeGuildId) return res.status(400).json({ error: "Geen server geselecteerd." });
  next();
}

// ── Auth ──

app.get("/auth/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "identify guilds",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Geen code ontvangen.");
  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("Geen access token ontvangen.");

    const [userRes, guildsRes] = await Promise.all([
      fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
      fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
    ]);
    const userData = await userRes.json();
    const guildsData = await guildsRes.json();

    const botGuildIds = new Set(client.guilds.cache.keys());
    const adminGuilds = guildsData
      .filter(g => botGuildIds.has(g.id) && (BigInt(g.permissions) & 0x20n) !== 0n)
      .map(g => ({ id: g.id, name: g.name, icon: g.icon }));

    if (adminGuilds.length === 0) return res.redirect(`${config.frontendUrl}?error=geen_toegang`);

    req.session.user = { id: userData.id, username: userData.username, avatar: userData.avatar };
    req.session.guilds = adminGuilds;
    req.session.activeGuildId = adminGuilds[0].id;
    res.redirect(config.frontendUrl);
  } catch (err) {
    console.error("OAuth fout:", err);
    res.status(500).send("Authenticatie mislukt.");
  }
});

app.get("/auth/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Niet ingelogd" });
  res.json(req.session.user);
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Guilds API ──

app.get("/api/guilds", requireAuth, (req, res) => {
  res.json({ guilds: req.session.guilds || [], activeGuildId: req.session.activeGuildId || null });
});

app.post("/api/guild", requireAuth, (req, res) => {
  const { guildId } = req.body;
  const guilds = req.session.guilds || [];
  if (!guilds.find(g => g.id === guildId)) return res.status(403).json({ error: "Geen toegang tot deze server." });
  req.session.activeGuildId = guildId;
  res.json({ ok: true });
});

// ── Vragen API ──

const mapVraag = v => ({ id: v.id, tekst: v.tekst, categorie: v.categorie, dmModus: v.dm_modus === 1 });

app.get("/api/vragen", requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const waarheid = stmts.getVragen.all(guildId, 'waarheid').map(mapVraag);
  const doen = stmts.getVragen.all(guildId, 'doen').map(mapVraag);
  res.json({ waarheid, doen });
});

app.post("/api/vragen", requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const { type, tekst, categorie, dmModus } = req.body;
  if (!["waarheid", "doen"].includes(type) || !tekst?.trim()) {
    return res.status(400).json({ error: "Ongeldige invoer." });
  }
  stmts.insertVraag.run(guildId, type, tekst.trim(), categorie?.trim() || '18+', dmModus ? 1 : 0);
  res.json({ ok: true });
});

app.put("/api/vragen/:id", requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const id = parseInt(req.params.id);
  const { tekst, categorie, dmModus } = req.body;
  if (isNaN(id) || !tekst?.trim()) return res.status(400).json({ error: "Ongeldige invoer." });
  const result = stmts.updateVraag.run(tekst.trim(), categorie?.trim() || '18+', dmModus ? 1 : 0, id, guildId);
  if (result.changes === 0) return res.status(404).json({ error: "Vraag niet gevonden." });
  res.json({ ok: true });
});

app.delete("/api/vragen/:id", requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Ongeldige invoer." });
  const result = stmts.deleteVraagById.run(id, guildId);
  if (result.changes === 0) return res.status(404).json({ error: "Vraag niet gevonden." });
  getGebruikte(guildId, 'waarheid').delete(id);
  getGebruikte(guildId, 'doen').delete(id);
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

app.get("/api/vragen/export", requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const rows = [['type', 'tekst', 'categorie']];
  stmts.getVragen.all(guildId, 'waarheid').forEach(v => rows.push(['waarheid', v.tekst, v.categorie]));
  stmts.getVragen.all(guildId, 'doen').forEach(v => rows.push(['doen', v.tekst, v.categorie]));
  const csv = rows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vragen.csv"');
  res.send(csv);
});

app.post("/api/vragen/import", requireAuth, requireGuild, express.text({ type: '*/*' }), (req, res) => {
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
    const insertMany = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVRow(lines[i]);
        const type = row[typeIdx]?.toLowerCase().trim();
        const tekst = row[tekstIdx]?.trim();
        const categorie = catIdx !== -1 ? (row[catIdx]?.trim() || '18+') : '18+';
        if (!tekst || !['waarheid', 'doen'].includes(type)) continue;
        stmts.insertVraag.run(guildId, type, tekst, categorie, 0);
        toegevoegd++;
      }
    });
    insertMany();
    res.json({ ok: true, toegevoegd });
  } catch {
    res.status(400).json({ error: 'Fout bij verwerken van bestand.' });
  }
});

// ── Statistieken API ──

app.get("/api/statistieken", requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const stats = getSessie(guildId);
  const waarheidTotaal = stmts.countVragen.get(guildId, 'waarheid').cnt;
  const doenTotaal = stmts.countVragen.get(guildId, 'doen').cnt;
  res.json({
    sessieStart: stats.sessieStart,
    aantalWaarheid: stats.aantalWaarheid,
    aantalDoen: stats.aantalDoen,
    rerollTeller: Object.fromEntries(stats.rerollTeller),
    waarheidTotaal,
    doenTotaal,
  });
});

app.post("/api/reset", requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  getGebruikte(guildId, 'waarheid').clear();
  getGebruikte(guildId, 'doen').clear();
  sessieData.delete(guildId);
  res.json({ ok: true });
});

app.post("/api/reload", requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  getGebruikte(guildId, 'waarheid').clear();
  getGebruikte(guildId, 'doen').clear();
  res.json({ ok: true });
});

// ── Instellingen API ──

app.get("/api/instellingen", requireAuth, requireGuild, (req, res) => {
  res.json(dbGetInstellingen(req.session.activeGuildId));
});

app.put("/api/instellingen", requireAuth, requireGuild, (req, res) => {
  const guildId = req.session.activeGuildId;
  const inst = dbGetInstellingen(guildId);
  const { cooldownMs, dmModus } = req.body;
  const newCooldown = typeof cooldownMs === "number" && cooldownMs >= 0 && cooldownMs <= 10000 ? cooldownMs : inst.cooldownMs;
  const newDM = typeof dmModus === "boolean" ? dmModus : inst.dmModus;
  stmts.upsertInstellingen.run(guildId, newCooldown, newDM ? 1 : 0);
  res.json({ cooldownMs: newCooldown, dmModus: newDM });
});

// ── Configuratie API ──

app.get("/api/config", requireAuth, (req, res) => {
  res.json(config);
});

app.put("/api/config", requireAuth, (req, res) => {
  const { redirectUri, frontendUrl } = req.body;
  if (redirectUri && typeof redirectUri === "string") config.redirectUri = redirectUri.trim();
  if (frontendUrl && typeof frontendUrl === "string") config.frontendUrl = frontendUrl.trim();
  slaConfigOp();
  res.json(config);
});

// ── Statische bestanden (productie) ──

const adminDist = join(__dirname, "admin", "dist");
if (existsSync(adminDist)) {
  app.use(express.static(adminDist));
  app.get("*", (req, res) => res.sendFile(join(adminDist, "index.html")));
}

app.listen(ADMIN_PORT, () => {
  console.log(`✅ Admin panel API draait op http://localhost:${ADMIN_PORT}`);
});

// ─── Start ─────────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);

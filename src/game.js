import { db, stmts, dbGetInstellingen } from './database.js';

export { dbGetInstellingen };

// ─── Sessie-cache ──────────────────────────────────────────────────────────────

export const sessieCache = new Map();

export function laadSessieInCache(sessie) {
  const cache = {
    gebruikteWaarheid: new Set(JSON.parse(sessie.gebruikte_waarheid)),
    gebruikteDoen: new Set(JSON.parse(sessie.gebruikte_doen)),
    rerollTeller: new Map(Object.entries(JSON.parse(sessie.reroll_teller))),
    sessieStart: new Date(sessie.sessie_start_iso),
    aantalWaarheid: sessie.aantal_waarheid,
    aantalDoen: sessie.aantal_doen,
  };
  sessieCache.set(sessie.id, cache);
  return cache;
}

export function getSessieCache(sessieId) {
  if (!sessieCache.has(sessieId)) {
    const sessie = stmts.getSessieById.get(sessieId);
    if (!sessie) return null;
    laadSessieInCache(sessie);
  }
  return sessieCache.get(sessieId);
}

export function saveSessieCache(sessieId) {
  const cache = sessieCache.get(sessieId);
  if (!cache) return;
  stmts.updateSessieData.run(
    JSON.stringify([...cache.gebruikteWaarheid]),
    JSON.stringify([...cache.gebruikteDoen]),
    cache.aantalWaarheid,
    cache.aantalDoen,
    JSON.stringify(Object.fromEntries(cache.rerollTeller)),
    sessieId
  );
}

export function getSessieId(guildId, channelId) {
  const link = stmts.getActieveSessieLink.get(guildId, channelId);
  if (link) {
    const sessie = stmts.getSessieById.get(link.sessie_id);
    if (sessie && sessie.status === 'actief') {
      if (!sessieCache.has(sessie.id)) laadSessieInCache(sessie);
      return sessie.id;
    }
  }
  const count = stmts.countSessies.get(guildId).cnt;
  const result = stmts.insertSessie.run(guildId, channelId, `Sessie ${count + 1}`);
  const sessieId = result.lastInsertRowid;
  stmts.upsertActieveSessieLink.run(guildId, channelId, sessieId);
  const sessie = stmts.getSessieById.get(sessieId);
  laadSessieInCache(sessie);
  return sessieId;
}

// ─── Beurtrotatie ──────────────────────────────────────────────────────────────

export const beurtenMap = new Map();

export function getBeurten(guildId) {
  if (!beurtenMap.has(guildId)) beurtenMap.set(guildId, { lijst: [], huidig: 0 });
  return beurtenMap.get(guildId);
}

export function getHuidigeSpeler(guildId) {
  const b = getBeurten(guildId);
  if (b.lijst.length === 0) return null;
  const { id, naam } = b.lijst[b.huidig];
  return { id, naam };
}

export function advanceerBeurt(guildId) {
  const b = getBeurten(guildId);
  if (b.lijst.length === 0) return null;
  b.huidig = (b.huidig + 1) % b.lijst.length;
  return b.lijst[b.huidig];
}

export function buildBeurtenLijstTekst(guildId) {
  const b = getBeurten(guildId);
  return b.lijst
    .map((s, i) => `${i === b.huidig ? '▶️' : `${i + 1}.`} **${s.naam}**`)
    .join('\n');
}

// ─── Vraag helpers ─────────────────────────────────────────────────────────────

export const CATEGORIEEN = {
  algemeen: { emoji: '🌐', naam: 'Algemeen' },
  vrienden: { emoji: '👫', naam: 'Vrienden' },
  koppels:  { emoji: '💑', naam: 'Koppels' },
  feest:    { emoji: '🎉', naam: 'Feest' },
  '18+':    { emoji: '🔞', naam: '18+' },
};

export const STANDAARD_CATEGORIE = 'algemeen';

// Maximale lengte van nieuwe invoer (tekens); gelijk houden met maxLength in het panel
export const MAX_LENGTE = { vraag: 500, stelling: 300 };

// '' of null → standaard; anders getrimd en in kleine letters
export function normaliseerCategorie(waarde) {
  const c = typeof waarde === 'string' ? waarde.trim().toLowerCase() : '';
  return c || STANDAARD_CATEGORIE;
}

export function isGeldigeCategorie(categorie) {
  return Object.hasOwn(CATEGORIEEN, categorie);
}

// Alleen voor weergave, bijv. '🔞 18+'
export function categorieLabel(categorie) {
  const c = CATEGORIEEN[categorie];
  return c ? `${c.emoji} ${c.naam}` : `🏷️ ${categorie}`;
}

// Vragen waaruit gekozen wordt: met een filter alleen die categorie (nooit een fallback).
export function getVraagPool(guildId, type, categorieFilter = null) {
  return categorieFilter
    ? stmts.getVragenByCategorie.all(guildId, type, categorieFilter)
    : stmts.getVragen.all(guildId, type);
}

export function getVraag(guildId, type, categorieFilter = null, sessieId = null) {
  const vragen = getVraagPool(guildId, type, categorieFilter);
  if (vragen.length === 0) return null;
  if (!sessieId) return vragen[Math.floor(Math.random() * vragen.length)];

  const cache = getSessieCache(sessieId);
  const gebruikte = type === 'waarheid' ? cache.gebruikteWaarheid : cache.gebruikteDoen;
  let beschikbaar = vragen.filter(v => !gebruikte.has(v.id));
  if (beschikbaar.length === 0) {
    // Alle vragen uit deze pool gehad: alleen deze pool opnieuw, de rest blijft staan
    for (const v of vragen) gebruikte.delete(v.id);
    beschikbaar = vragen;
  }
  const vraag = beschikbaar[Math.floor(Math.random() * beschikbaar.length)];
  gebruikte.add(vraag.id);
  saveSessieCache(sessieId);
  return vraag;
}

export function getCategorieFilter(guildId, channelId) {
  const inst = dbGetInstellingen(guildId);
  if (!inst.categoriePerChat) return null;
  const row = stmts.getChannelCategorie.get(guildId, channelId);
  return row ? row.categorie : null;
}

// ─── Cooldown ──────────────────────────────────────────────────────────────────

export const cooldowns = new Set();

export function inCooldown(userId, guildId) {
  const key = `${guildId}:${userId}`;
  if (cooldowns.has(key)) return true;
  cooldowns.add(key);
  const { cooldownMs } = dbGetInstellingen(guildId);
  setTimeout(() => cooldowns.delete(key), cooldownMs);
  return false;
}

// ─── Test sessies ──────────────────────────────────────────────────────────────

export const liefdestaalSessies = new Map();
export const persoonlijkheidSessies = new Map();
export const relatieSessies = new Map();
export const relatieSpelers = new Map();
export const nooitStemmen = new Map();

// ─── Liefdestaal data ──────────────────────────────────────────────────────────

export const LIEFDESTAAL_VRAGEN = [
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

export const LIEFDESTALEN = {
  W: { naam: 'Woorden van bevestiging', emoji: '💬', kleur: 0x5865f2, beschrijving: 'Jij bloeit op van complimenten, aanmoediging en lieve berichtjes.' },
  T: { naam: 'Kwaliteitsvolle tijd', emoji: '⏰', kleur: 0x57f287, beschrijving: 'Voor jou is echte, onverdeelde aandacht het mooiste cadeau.' },
  A: { naam: 'Lichamelijke aanraking', emoji: '🤗', kleur: 0xeb459e, beschrijving: 'Een knuffel zegt voor jou meer dan duizend woorden.' },
  D: { naam: 'Daden van dienst', emoji: '🛠️', kleur: 0xfee75c, beschrijving: 'Jij voelt liefde in daden – als iemand iets doet zonder dat jij erom vraagt.' },
  C: { naam: 'Cadeaus ontvangen', emoji: '🎁', kleur: 0xed4245, beschrijving: 'Jij waardeert de moeite en het nadenken achter een attent gebaar.' },
};

// ─── Persoonlijkheidstest data ─────────────────────────────────────────────────

export const PERSOONLIJKHEID_VRAGEN = [
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

export const PERSOONLIJKHEID_TYPES = {
  ETJ: { naam: 'De Commandant', kleur: 0xed4245, beschrijving: 'Doelgericht, georganiseerd en direct. Jij weet wat je wil en gaat ervoor.' },
  EFJ: { naam: 'De Verbinder', kleur: 0x57f287, beschrijving: 'Warm, sociaal en empathisch. Jij houdt de groep bij elkaar.' },
  ETP: { naam: 'De Debater', kleur: 0xffa500, beschrijving: 'Nieuwsgierig, energiek en altijd in voor een goed argument.' },
  EFP: { naam: 'De Levensgenieter', kleur: 0xfee75c, beschrijving: 'Enthousiast, spontaan en altijd het middelpunt van de avond.' },
  ITJ: { naam: 'De Strateeg', kleur: 0x5865f2, beschrijving: 'Rustig, analytisch en planmatig. Jij denkt altijd drie stappen vooruit.' },
  IFJ: { naam: 'De Dromer', kleur: 0xeb459e, beschrijving: 'Diep, intuïtief en warmhartig. Jij ziet wat anderen niet zien.' },
  ITP: { naam: 'De Denker', kleur: 0x99aab5, beschrijving: 'Onafhankelijk, analytisch en vol verrassende invalshoeken.' },
  IFP: { naam: 'De Kunstenaar', kleur: 0x9b59b6, beschrijving: 'Creatief, authentiek en altijd trouw aan jezelf.' },
};

// ─── Relatietest data ──────────────────────────────────────────────────────────

export const RELATIE_VRAGEN = [
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

export const RELATIE_SCORES = [
  { min: 9, tekst: '💑 Zielsverbonden! Jullie zijn op vrijwel alles hetzelfde afgestemd.' },
  { min: 7, tekst: '💕 Super goed op elkaar afgestemd! Jullie denken op de meeste dingen hetzelfde.' },
  { min: 5, tekst: '⚡ Een mooie mix! Jullie lijken op sommige dingen maar zijn op andere compleet anders.' },
  { min: 3, tekst: '🤔 Tegengestelden trekken aan. Jullie hebben genoeg om over te praten.' },
  { min: 0, tekst: '😅 Compleet tegengesteld — of juist perfect voor elkaar?' },
];

// ─── Levels definitie ──────────────────────────────────────────────────────────

export const LEVELS = [
  { level: 1, titel: 'Lafaard',    min: 0    },
  { level: 2, titel: 'Deelnemer',  min: 50   },
  { level: 3, titel: 'Durfal',     min: 150  },
  { level: 4, titel: 'Avonturier', min: 350  },
  { level: 5, titel: 'Onthulling', min: 700  },
  { level: 6, titel: 'Verleider',  min: 1200 },
  { level: 7, titel: 'Kampioen',   min: 2000 },
  { level: 8, titel: 'Legenda',    min: 3500 },
];

export function getLevelInfo(punten) {
  let huidig = LEVELS[0];
  for (const l of LEVELS) {
    if (punten >= l.min) huidig = l;
    else break;
  }
  const volgend = LEVELS.find(l => l.min > punten) ?? null;
  const voortgang = volgend
    ? Math.floor(((punten - huidig.min) / (volgend.min - huidig.min)) * 100)
    : 100;
  return { ...huidig, volgend, voortgang };
}

// ─── Punten & achievements ─────────────────────────────────────────────────────

// Enige definitie van de achievements. Met minLevel: toegekend vanaf dat level
// (uit de punten berekend). Zonder check en minLevel: toegekend in buttons.js.
export const ACHIEVEMENTS = [
  { id: 'Eerste stap',       emoji: '👣', beschrijving: 'Voor het eerst punten ontvangen',          check: r => r.punten !== null },
  { id: 'Durfal',            emoji: '💪', beschrijving: 'Level 3 (Durfal) bereikt',                  minLevel: 3 },
  { id: 'Onthullingsmaster', emoji: '🔓', beschrijving: 'Level 5 (Onthulling) bereikt',              minLevel: 5 },
  { id: 'Legenda',           emoji: '👑', beschrijving: 'Level 8 (Legenda) bereikt',                 minLevel: 8 },
  { id: 'Reroll addict',     emoji: '🎲', beschrijving: '10x gererold',                              check: r => (r.reroll_teller ?? 0) >= 10 },
  { id: 'Schijterd',         emoji: '😅', beschrijving: '5x gepast',                                 check: r => (r.passen_teller ?? 0) >= 5 },
  { id: 'Op dreef',          emoji: '🔥', beschrijving: '3 rondes voltooid',                         check: r => (r.rondes_teller ?? 0) >= 3 },
  { id: 'Lovebird',          emoji: '💑', beschrijving: '/relatietest voltooid' },
  { id: 'Zelfinzicht',       emoji: '🧠', beschrijving: '/liefdestaal of /persoonlijkheid voltooid' },
];

export function achievementEmoji(id) {
  return ACHIEVEMENTS.find(a => a.id === id)?.emoji ?? '🏆';
}

// Punten gaan nooit onder 0. effectiefDelta is wat er werkelijk bij of af ging.
// Achievements worden alleen gecontroleerd bij punten erbij: een aftrek levert
// nooit een achievement op.
export function voegPuntenToe(guildId, userId, userNaam, delta) {
  const huidig = stmts.getUserLevel.get(guildId, userId);
  const huidigePunten = huidig?.punten ?? 0;
  const levelVoor = getLevelInfo(huidigePunten).level;
  const nieuwePunten = Math.max(0, huidigePunten + delta);
  const effectiefDelta = nieuwePunten - huidigePunten;
  const nieuwLevel = getLevelInfo(nieuwePunten);
  stmts.upsertUserLevel.run(guildId, userId, userNaam, effectiefDelta, nieuwLevel.level);
  const achievements = delta > 0 ? checkAchievements(guildId, userId) : [];
  return { achievements, levelVoor, levelNa: nieuwLevel.level, levelInfo: nieuwLevel, puntenNa: nieuwePunten, effectiefDelta };
}

export function checkAchievements(guildId, userId) {
  const row = stmts.getUserLevel.get(guildId, userId);
  if (!row) return [];
  const level = getLevelInfo(row.punten).level;
  const behaald = new Set(stmts.getUserAchievements.all(guildId, userId).map(a => a.achievement));
  const nieuw = [];

  for (const a of ACHIEVEMENTS) {
    if (behaald.has(a.id)) continue;
    const verdiend = a.minLevel ? level >= a.minLevel : a.check ? a.check(row) : false;
    if (!verdiend) continue;
    stmts.insertAchievement.run(guildId, userId, a.id);
    nieuw.push(a.id);
  }

  return nieuw;
}

// ─── Eenmalige migratie achievements (v1.10.0) ─────────────────────────────────
// Hernoemt "Lafaard" naar "Schijterd", trekt de kolom level gelijk met de punten
// en zet de level-achievements recht. Draait één keer (tabel migraties).

const MIGRATIE_ACHIEVEMENTS = 'achievements_v1_10';

export function migreerAchievements() {
  if (stmts.getMigratie.get(MIGRATIE_ACHIEVEMENTS)) return;
  const levelAchievements = ACHIEVEMENTS.filter(a => a.minLevel);

  const resultaat = db.transaction(() => {
    let toegekend = 0, ingetrokken = 0;
    const hernoemd = stmts.hernoemAchievement.run('Schijterd', 'Lafaard').changes;
    stmts.deleteAchievementAlle.run('Lafaard'); // alleen over als iemand beide al had

    for (const row of stmts.getAlleUserLevels.all()) {
      const lvl = getLevelInfo(row.punten).level;
      if (row.level !== lvl) stmts.updateUserLevelKolom.run(lvl, row.guild_id, row.user_id);
      for (const a of levelAchievements) {
        if (lvl >= a.minLevel) toegekend += stmts.insertAchievement.run(row.guild_id, row.user_id, a.id).changes;
        else ingetrokken += stmts.deleteAchievement.run(row.guild_id, row.user_id, a.id).changes;
      }
    }

    stmts.insertMigratie.run(MIGRATIE_ACHIEVEMENTS);
    return { toegekend, ingetrokken, hernoemd };
  })();

  console.log(`🏅 Achievements rechtgezet: ${resultaat.toegekend} toegekend, ${resultaat.ingetrokken} ingetrokken, ${resultaat.hernoemd} hernoemd.`);
}

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
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import session from "express-session";
import cors from "cors";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const VRAGEN_PAD = join(__dirname, "vragen.json");
const INSTELLINGEN_PAD = join(__dirname, "settings.json");
const CONFIG_PAD = join(__dirname, "config.json");

// ─── Vragen laden & opslaan ────────────────────────────────────────────────────

let waarheidVragen = [];
let doenOpdrachten = [];
const gebruikteWaarheid = new Set();
const gebruikteDoen = new Set();

function laadVragen() {
  try {
    const data = JSON.parse(readFileSync(VRAGEN_PAD, "utf-8"));
    if (!Array.isArray(data.waarheid) || !Array.isArray(data.doen)) {
      throw new Error('vragen.json moet een "waarheid" en "doen" array bevatten.');
    }
    waarheidVragen = data.waarheid.map(v => typeof v === 'string' ? { tekst: v, categorie: '18+', dmModus: false } : { dmModus: false, ...v });
    doenOpdrachten = data.doen.map(v => typeof v === 'string' ? { tekst: v, categorie: '18+', dmModus: false } : { dmModus: false, ...v });
    gebruikteWaarheid.clear();
    gebruikteDoen.clear();
    console.log(`✅ Vragen geladen: ${waarheidVragen.length} waarheid, ${doenOpdrachten.length} doen.`);
    return true;
  } catch (err) {
    console.error("❌ Fout bij laden van vragen.json:", err.message);
    return false;
  }
}

function slaVragenOp() {
  try {
    writeFileSync(VRAGEN_PAD, JSON.stringify({ waarheid: waarheidVragen, doen: doenOpdrachten }, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("❌ Fout bij opslaan van vragen.json:", err.message);
    return false;
  }
}

laadVragen();

// ─── Instellingen ──────────────────────────────────────────────────────────────

const instellingen = { cooldownMs: 1500, dmModus: false };

function laadInstellingen() {
  try {
    const data = JSON.parse(readFileSync(INSTELLINGEN_PAD, "utf-8"));
    Object.assign(instellingen, data);
    console.log("✅ Instellingen geladen.");
  } catch {
    console.log("ℹ️ Geen settings.json, standaardwaarden gebruikt.");
  }
}

function slaInstellingenOp() {
  try {
    writeFileSync(INSTELLINGEN_PAD, JSON.stringify(instellingen, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Fout bij opslaan instellingen:", err.message);
  }
}

laadInstellingen();

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

// ─── Statistieken ──────────────────────────────────────────────────────────────

const sessieStart = new Date();
let aantalWaarheid = 0;
let aantalDoen = 0;
const rerollTeller = new Map(); // userId -> { naam, teller }

function registreerReroll(user) {
  const huidig = rerollTeller.get(user.id) ?? { naam: user.displayName, teller: 0 };
  rerollTeller.set(user.id, { naam: user.displayName, teller: huidig.teller + 1 });
}

function resetStatistieken() {
  aantalWaarheid = 0;
  aantalDoen = 0;
  rerollTeller.clear();
}

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

const beurtenLijst = []; // [{ id, naam }]
let huidigeBeurt = 0;

function getHuidigeSpelerNaam() {
  if (beurtenLijst.length === 0) return null;
  return beurtenLijst[huidigeBeurt].naam;
}

function advanceerBeurt() {
  if (beurtenLijst.length === 0) return null;
  huidigeBeurt = (huidigeBeurt + 1) % beurtenLijst.length;
  return beurtenLijst[huidigeBeurt];
}

function buildBeurtenLijstTekst() {
  return beurtenLijst
    .map((s, i) => `${i === huidigeBeurt ? "▶️" : `${i + 1}.`} **${s.naam}**`)
    .join("\n");
}

// ─── Vraag helpers ─────────────────────────────────────────────────────────────

function getVraag(lijst, gebruikte) {
  if (gebruikte.size >= lijst.length) {
    gebruikte.clear();
    console.log("🔄 Alle vragen geweest, lijst gereset.");
  }
  const beschikbaar = lijst.map((_, i) => i).filter(i => !gebruikte.has(i));
  const index = beschikbaar[Math.floor(Math.random() * beschikbaar.length)];
  gebruikte.add(index);
  return lijst[index];
}

function haalVraagUitEmbed(description, lijst, gebruikte) {
  if (!description) return;
  const markerIdx = description.indexOf('\n\n> ');
  if (markerIdx === -1) return;
  const oudeVraag = description.slice(markerIdx + 4);
  const oudeIndex = lijst.findIndex(v => v.tekst === oudeVraag);
  if (oudeIndex !== -1) gebruikte.delete(oudeIndex);
}

// ─── Cooldown ──────────────────────────────────────────────────────────────────

const cooldowns = new Set();

function inCooldown(userId) {
  if (cooldowns.has(userId)) return true;
  cooldowns.add(userId);
  setTimeout(() => cooldowns.delete(userId), instellingen.cooldownMs);
  return false;
}

// ─── Bot Setup ─────────────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName("wod")
    .setDescription("Start een ronde Waarheid of Doen!")
    .addUserOption(opt =>
      opt.setName("speler")
        .setDescription("Richt de vraag op een specifieke speler.")
        .setRequired(false)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("waarheid")
    .setDescription("Krijg direct een waarheidsvraag.")
    .addIntegerOption(opt =>
      opt.setName("nummer")
        .setDescription("Optioneel: vraag een specifieke vraag op via nummer (zie /lijst).")
        .setRequired(false)
        .setMinValue(1)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("doen")
    .setDescription("Krijg direct een doe-opdracht.")
    .addIntegerOption(opt =>
      opt.setName("nummer")
        .setDescription("Optioneel: vraag een specifieke opdracht op via nummer (zie /lijst).")
        .setRequired(false)
        .setMinValue(1)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("beurt")
    .setDescription("Beheer de beurtrotatie.")
    .addSubcommand(sub =>
      sub.setName("toevoegen")
        .setDescription("Voeg een speler toe aan de rotatie.")
        .addUserOption(opt => opt.setName("speler").setDescription("De toe te voegen speler.").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("verwijder")
        .setDescription("Verwijder een speler uit de rotatie.")
        .addUserOption(opt => opt.setName("speler").setDescription("De te verwijderen speler.").setRequired(true))
    )
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
      opt.setName("stelling")
        .setDescription("De stelling (optioneel, anders kiest de bot er een)")
        .setRequired(false)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("persoonlijkheid")
    .setDescription("Doe een korte persoonlijkheidstest en ontdek jouw type!")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("relatietest")
    .setDescription("Test hoe goed jij en een andere speler bij elkaar passen!")
    .addUserOption(opt =>
      opt.setName("speler")
        .setDescription("De speler waarmee je de test doet")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Herlaad de vragen uit vragen.json. (Alleen voor admins)")
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
      opt.setName("type")
        .setDescription("Waarheid of doen?")
        .setRequired(true)
        .addChoices(
          { name: "Waarheid", value: "waarheid" },
          { name: "Doen", value: "doen" }
        )
    )
    .addStringOption(opt =>
      opt.setName("tekst")
        .setDescription("De tekst van de vraag of opdracht.")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("verwijder")
    .setDescription("Verwijder een vraag of opdracht. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("type")
        .setDescription("Waarheid of doen?")
        .setRequired(true)
        .addChoices(
          { name: "Waarheid", value: "waarheid" },
          { name: "Doen", value: "doen" }
        )
    )
    .addIntegerOption(opt =>
      opt.setName("nummer")
        .setDescription("Het nummer van de vraag (gebruik /lijst om nummers te zien).")
        .setRequired(true)
        .setMinValue(1)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("lijst")
    .setDescription("Bekijk alle huidige vragen en opdrachten. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("type")
        .setDescription("Waarheid, doen, of allebei?")
        .setRequired(false)
        .addChoices(
          { name: "Waarheid", value: "waarheid" },
          { name: "Doen", value: "doen" }
        )
    )
    .toJSON(),
];

client.once("ready", async () => {
  console.log(`✅ Ingelogd als ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands geregistreerd!");
  } catch (err) {
    console.error("❌ Fout bij registreren van commands:", err);
  }
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

function buildWaarheidEmbed(vraag, user, isReroll = false) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(isReroll ? "🔵 Waarheid — Reroll" : "🔵 Waarheid")
    .setDescription(`**${user.displayName}**, beantwoord eerlijk:\n\n> ${vraag}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruikteWaarheid.size}/${waarheidVragen.length} vragen gehad` })
    .setTimestamp();
}

function buildDoenEmbed(opdracht, user, isReroll = false) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(isReroll ? "🔴 Doen — Reroll" : "🔴 Doen")
    .setDescription(`**${user.displayName}**, jouw opdracht:\n\n> ${opdracht}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruikteDoen.size}/${doenOpdrachten.length} opdrachten gehad` })
    .setTimestamp();
}

function buildStrafWaarheidEmbed(vraag, user) {
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("🔵 Waarheid — Strafvraag")
    .setDescription(`**${user.displayName}** heeft gepast! Hier is je strafvraag:\n\n> ${vraag}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruikteWaarheid.size}/${waarheidVragen.length} vragen gehad` })
    .setTimestamp();
}

function buildStrafDoenEmbed(opdracht, user) {
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("🔴 Doen — Strafopdracht")
    .setDescription(`**${user.displayName}** heeft gepast! Hier is je strafopdracht:\n\n> ${opdracht}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruikteDoen.size}/${doenOpdrachten.length} opdrachten gehad` })
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

function buildStatistiekenEmbed() {
  const totaal = aantalWaarheid + aantalDoen;
  const duur = Math.floor((new Date() - sessieStart) / 60000);
  const uren = Math.floor(duur / 60);
  const minuten = duur % 60;
  const duurTekst = uren > 0 ? `${uren}u ${minuten}m` : `${minuten}m`;

  const rerollLijst = [...rerollTeller.entries()]
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
      { name: "🔵 Waarheid", value: `${aantalWaarheid}x`, inline: true },
      { name: "🔴 Doen", value: `${aantalDoen}x`, inline: true },
      { name: "​", value: "​", inline: true },
      {
        name: "🎲 Reroll ranglijst",
        value: rerollLijst || "Nog niemand gererolld!",
        inline: false,
      }
    )
    .setFooter({ text: `Sessie gestart om ${sessieStart.toLocaleTimeString("nl-NL")}` })
    .setTimestamp();
}

function buildLijstEmbeds(type) {
  const lijst = type === "waarheid" ? waarheidVragen : doenOpdrachten;
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
      embeds.push(
        new EmbedBuilder()
          .setColor(kleur)
          .setTitle(`${emoji} ${label} (${startNummer}–${i})`)
          .setDescription(huidigeTekst.trim())
      );
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
  const user = interaction.member ?? interaction.user;

  // ── Slash Commands ──
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "wod") {
      const doelLid = interaction.options.getMember("speler");
      let doelNaam = null;
      if (doelLid) {
        doelNaam = doelLid.displayName;
      } else if (beurtenLijst.length > 0) {
        doelNaam = getHuidigeSpelerNaam();
      }
      await interaction.reply({ embeds: [buildKiesEmbed(user, doelNaam)], components: [buildKiesButtons()] });
      return;
    }

    if (interaction.commandName === "waarheid") {
      const nummer = interaction.options.getInteger("nummer");
      if (nummer !== null) {
        if (nummer > waarheidVragen.length) {
          await interaction.reply({ content: `❌ Er is geen waarheidsvraag met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
          return;
        }
        const vraag = waarheidVragen[nummer - 1];
        gebruikteWaarheid.add(nummer - 1);
        aantalWaarheid++;
        await interaction.reply({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
      } else {
        const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
        aantalWaarheid++;
        await interaction.reply({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.commandName === "doen") {
      const nummer = interaction.options.getInteger("nummer");
      if (nummer !== null) {
        if (nummer > doenOpdrachten.length) {
          await interaction.reply({ content: `❌ Er is geen doe-opdracht met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
          return;
        }
        const opdracht = doenOpdrachten[nummer - 1];
        gebruikteDoen.add(nummer - 1);
        aantalDoen++;
        await interaction.reply({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
      } else {
        const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
        aantalDoen++;
        await interaction.reply({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.commandName === "beurt") {
      const sub = interaction.options.getSubcommand();

      if (sub === "toevoegen") {
        const doelUser = interaction.options.getUser("speler");
        const doelLid = interaction.options.getMember("speler");
        const naam = doelLid?.displayName ?? doelUser.username;
        if (beurtenLijst.some(s => s.id === doelUser.id)) {
          await interaction.reply({ content: `**${naam}** staat al in de rotatie.`, ephemeral: true });
          return;
        }
        beurtenLijst.push({ id: doelUser.id, naam });
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Speler toegevoegd")
            .setDescription(`**${naam}** is toegevoegd aan de rotatie.\n\n${buildBeurtenLijstTekst()}`)
            .setTimestamp()],
        });
        return;
      }

      if (sub === "verwijder") {
        const doelUser = interaction.options.getUser("speler");
        const idx = beurtenLijst.findIndex(s => s.id === doelUser.id);
        if (idx === -1) {
          await interaction.reply({ content: "Die speler staat niet in de rotatie.", ephemeral: true });
          return;
        }
        const verwijderd = beurtenLijst.splice(idx, 1)[0];
        if (huidigeBeurt >= beurtenLijst.length) huidigeBeurt = 0;
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Speler verwijderd")
            .setDescription(`**${verwijderd.naam}** is verwijderd uit de rotatie.${beurtenLijst.length > 0 ? `\n\n${buildBeurtenLijstTekst()}` : ""}`)
            .setTimestamp()],
        });
        return;
      }

      if (sub === "lijst") {
        if (beurtenLijst.length === 0) {
          await interaction.reply({ content: "De rotatie is leeg. Voeg spelers toe met `/beurt toevoegen`.", ephemeral: true });
          return;
        }
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🔄 Beurtrotatie")
            .setDescription(buildBeurtenLijstTekst())
            .setTimestamp()],
        });
        return;
      }

      if (sub === "reset") {
        beurtenLijst.length = 0;
        huidigeBeurt = 0;
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Rotatie gewist")
            .setDescription("De beurtrotatie is gewist.")
            .setTimestamp()],
        });
        return;
      }

      if (sub === "volgende") {
        if (beurtenLijst.length === 0) {
          await interaction.reply({ content: "De rotatie is leeg.", ephemeral: true });
          return;
        }
        const volgende = advanceerBeurt();
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🔄 Volgende speler")
            .setDescription(`Het is nu **${volgende.naam}**'s beurt!\n\n${buildBeurtenLijstTekst()}`)
            .setTimestamp()],
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
      await interaction.reply({ embeds: [buildStatistiekenEmbed()] });
      return;
    }

    if (interaction.commandName === "reset") {
      gebruikteWaarheid.clear();
      gebruikteDoen.clear();
      resetStatistieken();

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Reset voltooid")
            .setDescription("Alle gebruikte vragen en statistieken zijn gereset. Veel speelplezier! 🎉")
            .setTimestamp(),
        ],
      });
      return;
    }

    if (interaction.commandName === "reload") {
      const succes = laadVragen();
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(succes ? 0x57f287 : 0xed4245)
            .setTitle(succes ? "✅ Vragen herladen" : "❌ Herladen mislukt")
            .setDescription(
              succes
                ? `Vragen succesvol geladen.\n\n📋 **${waarheidVragen.length}** waarheidsvragen\n🎯 **${doenOpdrachten.length}** doe-opdrachten`
                : "Controleer of `vragen.json` geldig JSON is met een `waarheid` en `doen` array."
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "voeg-toe") {
      const type = interaction.options.getString("type");
      const tekst = interaction.options.getString("tekst").trim();

      if (type === "waarheid") {
        waarheidVragen.push({ tekst, categorie: 'algemeen' });
      } else {
        doenOpdrachten.push({ tekst, categorie: 'algemeen' });
      }

      const succes = slaVragenOp();
      const lijst = type === "waarheid" ? waarheidVragen : doenOpdrachten;
      const label = type === "waarheid" ? "waarheidsvraag" : "doe-opdracht";

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(succes ? 0x57f287 : 0xed4245)
            .setTitle(succes ? "✅ Toegevoegd" : "❌ Opslaan mislukt")
            .setDescription(
              succes
                ? `Nieuwe ${label} toegevoegd als #${lijst.length}:\n\n> ${tekst}`
                : "De vraag is toegevoegd maar kon niet worden opgeslagen naar `vragen.json`."
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "verwijder") {
      const type = interaction.options.getString("type");
      const nummer = interaction.options.getInteger("nummer");
      const lijst = type === "waarheid" ? waarheidVragen : doenOpdrachten;
      const label = type === "waarheid" ? "waarheidsvraag" : "doe-opdracht";

      if (nummer > lijst.length) {
        await interaction.reply({
          content: `❌ Er is geen ${label} met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`,
          ephemeral: true,
        });
        return;
      }

      const tekst = lijst[nummer - 1].tekst;

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle("⚠️ Bevestig verwijdering")
            .setDescription(`Weet je zeker dat je ${label} #${nummer} wilt verwijderen?\n\n> ${tekst}`)
            .setTimestamp(),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`verwijder_ja_${type}_${nummer}`).setLabel("🗑️ Ja, verwijder").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("verwijder_nee").setLabel("❌ Annuleer").setStyle(ButtonStyle.Secondary)
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "lijst") {
      const type = interaction.options.getString("type");
      if (!type) {
        const alleEmbeds = [...buildLijstEmbeds("waarheid"), ...buildLijstEmbeds("doen")].slice(0, 10);
        await interaction.reply({ embeds: alleEmbeds, ephemeral: true });
      } else {
        await interaction.reply({ embeds: buildLijstEmbeds(type), ephemeral: true });
      }
      return;
    }
  }

  // ── Buttons ──
  if (interaction.isButton()) {
    if (inCooldown(user.id)) return;

    if (interaction.customId === "kies_waarheid") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
      aantalWaarheid++;
      if (instellingen.dmModus || vraag.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user)] });
          await interaction.followUp({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
        } catch {
          await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.customId === "kies_doen") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
      aantalDoen++;
      if (instellingen.dmModus || opdracht.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user)] });
          await interaction.followUp({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
        } catch {
          await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.customId === "kies_random") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      if (Math.random() < 0.5) {
        const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
        aantalWaarheid++;
        if (instellingen.dmModus || vraag.dmModus) {
          try {
            await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user)] });
            await interaction.followUp({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
          } catch {
            await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
          }
        } else {
          await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
        aantalDoen++;
        if (instellingen.dmModus || opdracht.dmModus) {
          try {
            await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user)] });
            await interaction.followUp({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
          } catch {
            await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
          }
        } else {
          await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
        }
      }
      return;
    }

    if (interaction.customId === "reroll_waarheid") {
      registreerReroll(user);
      haalVraagUitEmbed(interaction.message.embeds[0]?.description, waarheidVragen, gebruikteWaarheid);
      const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
      await interaction.deferUpdate();
      await interaction.message.delete();
      if (instellingen.dmModus || vraag.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user, true)] });
          await interaction.followUp({ content: `📩 Reroll verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
        } catch {
          await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, true)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, true)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.customId === "reroll_doen") {
      registreerReroll(user);
      haalVraagUitEmbed(interaction.message.embeds[0]?.description, doenOpdrachten, gebruikteDoen);
      const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
      await interaction.deferUpdate();
      await interaction.message.delete();
      if (instellingen.dmModus || opdracht.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user, true)] });
          await interaction.followUp({ content: `📩 Reroll verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
        } catch {
          await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, true)], components: [buildActieButtons("doen")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, true)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.customId === "passen_waarheid") {
      haalVraagUitEmbed(interaction.message.embeds[0]?.description, waarheidVragen, gebruikteWaarheid);
      const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
      await interaction.deferUpdate();
      await interaction.message.delete();
      if (instellingen.dmModus || vraag.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildStrafWaarheidEmbed(vraag.tekst, user)] });
          await interaction.followUp({ content: `📩 Strafvraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
        } catch {
          await interaction.followUp({ embeds: [buildStrafWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildStrafWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.customId === "passen_doen") {
      haalVraagUitEmbed(interaction.message.embeds[0]?.description, doenOpdrachten, gebruikteDoen);
      const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
      await interaction.deferUpdate();
      await interaction.message.delete();
      if (instellingen.dmModus || opdracht.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildStrafDoenEmbed(opdracht.tekst, user)] });
          await interaction.followUp({ content: `📩 Strafopdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
        } catch {
          await interaction.followUp({ embeds: [buildStrafDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildStrafDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
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
      const keuze = actie === 'A' ? 'A' : 'B';
      speler.antwoorden.push(keuze);

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
      if (beurtenLijst.length > 0) {
        doelNaam = advanceerBeurt().naam;
      }
      await interaction.update({ components: [] });
      await interaction.followUp({ embeds: [buildKiesEmbed(user, doelNaam)], components: [buildKiesButtons()] });
      return;
    }

    if (interaction.customId.startsWith("verwijder_ja_")) {
      // customId formaat: verwijder_ja_{type}_{nummer}
      const parts = interaction.customId.split("_");
      const type = parts[2];
      const nummer = parseInt(parts[3]);
      const lijst = type === "waarheid" ? waarheidVragen : doenOpdrachten;
      const label = type === "waarheid" ? "waarheidsvraag" : "doe-opdracht";

      if (nummer > lijst.length) {
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Niet gevonden").setDescription(`${label} #${nummer} bestaat niet meer.`).setTimestamp()],
          components: [],
        });
        return;
      }

      const verwijderd = lijst.splice(nummer - 1, 1)[0];
      gebruikteWaarheid.clear();
      gebruikteDoen.clear();
      const succes = slaVragenOp();

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(succes ? 0x57f287 : 0xed4245)
            .setTitle(succes ? "🗑️ Verwijderd" : "❌ Opslaan mislukt")
            .setDescription(
              succes
                ? `${label.charAt(0).toUpperCase() + label.slice(1)} #${nummer} verwijderd:\n\n> ${verwijderd.tekst}\n\n*(De nummers zijn opnieuw ingedeeld)*`
                : "De vraag is verwijderd maar kon niet worden opgeslagen naar `vragen.json`."
            )
            .setTimestamp(),
        ],
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

// cors gebruikt config.frontendUrl op request-tijd zodat wijzigingen direct gelden
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

    // Toegang verlenen als de gebruiker ManageGuild heeft op een server waar de bot ook in zit
    const botGuildIds = new Set(client.guilds.cache.keys());
    const isAdmin = guildsData.some(
      g => botGuildIds.has(g.id) && (BigInt(g.permissions) & 0x20n) !== 0n
    );
    if (!isAdmin) return res.redirect(`${config.frontendUrl}?error=geen_toegang`);

    req.session.user = { id: userData.id, username: userData.username, avatar: userData.avatar };
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

// ── Vragen API ──

app.get("/api/vragen", requireAuth, (req, res) => {
  res.json({ waarheid: waarheidVragen, doen: doenOpdrachten });
});

app.post("/api/vragen", requireAuth, (req, res) => {
  const { type, tekst, categorie, dmModus } = req.body;
  if (!["waarheid", "doen"].includes(type) || !tekst?.trim()) {
    return res.status(400).json({ error: "Ongeldige invoer." });
  }
  const trimmed = tekst.trim();
  const cat = categorie?.trim() || 'algemeen';
  const vDM = typeof dmModus === 'boolean' ? dmModus : false;
  if (type === "waarheid") waarheidVragen.push({ tekst: trimmed, categorie: cat, dmModus: vDM });
  else doenOpdrachten.push({ tekst: trimmed, categorie: cat, dmModus: vDM });
  slaVragenOp();
  res.json({ ok: true });
});

app.put("/api/vragen/:type/:index", requireAuth, (req, res) => {
  const { type, index } = req.params;
  const { tekst, categorie, dmModus } = req.body;
  const lijst = type === "waarheid" ? waarheidVragen : type === "doen" ? doenOpdrachten : null;
  const idx = parseInt(index);
  if (!lijst || isNaN(idx) || idx < 0 || idx >= lijst.length || !tekst?.trim()) {
    return res.status(400).json({ error: "Ongeldige invoer." });
  }
  lijst[idx] = {
    tekst: tekst.trim(),
    categorie: categorie?.trim() || lijst[idx].categorie || 'algemeen',
    dmModus: typeof dmModus === 'boolean' ? dmModus : lijst[idx].dmModus ?? false,
  };
  slaVragenOp();
  res.json({ ok: true });
});

app.delete("/api/vragen/:type/:index", requireAuth, (req, res) => {
  const { type, index } = req.params;
  const lijst = type === "waarheid" ? waarheidVragen : type === "doen" ? doenOpdrachten : null;
  const idx = parseInt(index);
  if (!lijst || isNaN(idx) || idx < 0 || idx >= lijst.length) {
    return res.status(400).json({ error: "Ongeldige invoer." });
  }
  lijst.splice(idx, 1);
  gebruikteWaarheid.clear();
  gebruikteDoen.clear();
  slaVragenOp();
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

app.get("/api/vragen/export", requireAuth, (req, res) => {
  const rows = [['type', 'tekst', 'categorie']];
  waarheidVragen.forEach(v => rows.push(['waarheid', v.tekst, v.categorie]));
  doenOpdrachten.forEach(v => rows.push(['doen', v.tekst, v.categorie]));
  const csv = rows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vragen.csv"');
  res.send(csv);
});

app.post("/api/vragen/import", requireAuth, express.text({ type: '*/*' }), (req, res) => {
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
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVRow(lines[i]);
      const type = row[typeIdx]?.toLowerCase().trim();
      const tekst = row[tekstIdx]?.trim();
      const categorie = catIdx !== -1 ? (row[catIdx]?.trim() || 'algemeen') : 'algemeen';
      if (!tekst || !['waarheid', 'doen'].includes(type)) continue;
      if (type === 'waarheid') waarheidVragen.push({ tekst, categorie });
      else doenOpdrachten.push({ tekst, categorie });
      toegevoegd++;
    }
    slaVragenOp();
    res.json({ ok: true, toegevoegd });
  } catch {
    res.status(400).json({ error: 'Fout bij verwerken van bestand.' });
  }
});

// ── Statistieken API ──

app.get("/api/statistieken", requireAuth, (req, res) => {
  res.json({
    sessieStart,
    aantalWaarheid,
    aantalDoen,
    rerollTeller: Object.fromEntries(rerollTeller),
    waarheidTotaal: waarheidVragen.length,
    doenTotaal: doenOpdrachten.length,
  });
});

app.post("/api/reset", requireAuth, (req, res) => {
  gebruikteWaarheid.clear();
  gebruikteDoen.clear();
  resetStatistieken();
  res.json({ ok: true });
});

app.post("/api/reload", requireAuth, (req, res) => {
  const succes = laadVragen();
  res.json({ ok: succes });
});

// ── Instellingen API ──

app.get("/api/instellingen", requireAuth, (req, res) => {
  res.json(instellingen);
});

app.put("/api/instellingen", requireAuth, (req, res) => {
  const { cooldownMs, dmModus } = req.body;
  if (typeof cooldownMs === "number" && cooldownMs >= 0 && cooldownMs <= 10000) {
    instellingen.cooldownMs = cooldownMs;
  }
  if (typeof dmModus === "boolean") {
    instellingen.dmModus = dmModus;
  }
  slaInstellingenOp();
  res.json(instellingen);
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

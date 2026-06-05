import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { stmts } from './database.js';
import { getSessieCache, LIEFDESTAAL_VRAGEN, LIEFDESTALEN, PERSOONLIJKHEID_VRAGEN, PERSOONLIJKHEID_TYPES, RELATIE_VRAGEN, RELATIE_SCORES, getLevelInfo } from './game.js';

export function buildKiesEmbed(user, doelNaam = null) {
  const naam = doelNaam ?? user.displayName;
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('🎮 Waarheid of Doen')
    .setDescription(`Het is **${naam}**'s beurt! Kies een optie hieronder.`)
    .setFooter({ text: 'Waarheid of Doen • Durf jij het aan?' });
}

export function buildWaarheidEmbed(vraagTekst, user, guildId, isReroll = false, sessieId = null) {
  const totaal = stmts.countVragen.get(guildId, 'waarheid').cnt;
  const gebruiktCount = sessieId ? (getSessieCache(sessieId)?.gebruikteWaarheid.size ?? 0) : 0;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(isReroll ? '🔵 Waarheid — Reroll' : '🔵 Waarheid')
    .setDescription(`**${user.displayName}**, beantwoord eerlijk:\n\n> ${vraagTekst}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruiktCount}/${totaal} vragen gehad` })
    .setTimestamp();
}

export function buildDoenEmbed(opdrachtTekst, user, guildId, isReroll = false, sessieId = null) {
  const totaal = stmts.countVragen.get(guildId, 'doen').cnt;
  const gebruiktCount = sessieId ? (getSessieCache(sessieId)?.gebruikteDoen.size ?? 0) : 0;
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(isReroll ? '🔴 Doen — Reroll' : '🔴 Doen')
    .setDescription(`**${user.displayName}**, jouw opdracht:\n\n> ${opdrachtTekst}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruiktCount}/${totaal} opdrachten gehad` })
    .setTimestamp();
}

export function buildStrafWaarheidEmbed(vraagTekst, user, guildId, sessieId = null) {
  const totaal = stmts.countVragen.get(guildId, 'waarheid').cnt;
  const gebruiktCount = sessieId ? (getSessieCache(sessieId)?.gebruikteWaarheid.size ?? 0) : 0;
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle('🔵 Waarheid — Strafvraag')
    .setDescription(`**${user.displayName}** heeft gepast! Hier is je strafvraag:\n\n> ${vraagTekst}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruiktCount}/${totaal} vragen gehad` })
    .setTimestamp();
}

export function buildStrafDoenEmbed(opdrachtTekst, user, guildId, sessieId = null) {
  const totaal = stmts.countVragen.get(guildId, 'doen').cnt;
  const gebruiktCount = sessieId ? (getSessieCache(sessieId)?.gebruikteDoen.size ?? 0) : 0;
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle('🔴 Doen — Strafopdracht')
    .setDescription(`**${user.displayName}** heeft gepast! Hier is je strafopdracht:\n\n> ${opdrachtTekst}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruiktCount}/${totaal} opdrachten gehad` })
    .setTimestamp();
}

export function buildKiesButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('kies_waarheid').setLabel('🔵 Waarheid').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('kies_doen').setLabel('🔴 Doen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('kies_random').setLabel('🎲 Verrassing!').setStyle(ButtonStyle.Secondary)
  );
}

export function buildDisabledKiesButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('kies_waarheid').setLabel('🔵 Waarheid').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('kies_doen').setLabel('🔴 Doen').setStyle(ButtonStyle.Danger).setDisabled(true),
    new ButtonBuilder().setCustomId('kies_random').setLabel('🎲 Verrassing!').setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
}

export function buildActieButtons(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reroll_${type}`).setLabel('🎲 Reroll').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`passen_${type}`).setLabel('❌ Passen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('nieuwe_ronde').setLabel('🔄 Nieuwe ronde').setStyle(ButtonStyle.Success)
  );
}

export function buildStatistiekenEmbed(guildId, channelId = null) {
  let cache = null;
  let sessieNaam = 'Sessie';
  if (channelId) {
    const link = stmts.getActieveSessieLink.get(guildId, channelId);
    if (link) {
      cache = getSessieCache(link.sessie_id);
      const sessie = stmts.getSessieById.get(link.sessie_id);
      if (sessie) sessieNaam = sessie.naam;
    }
  }
  if (!cache) {
    const actieveSessies = stmts.getSessiesGuild.all(guildId).filter(s => s.status === 'actief');
    if (actieveSessies.length > 0) {
      cache = getSessieCache(actieveSessies[0].id);
      sessieNaam = actieveSessies[0].naam;
    }
  }
  if (!cache) {
    cache = { aantalWaarheid: 0, aantalDoen: 0, rerollTeller: new Map(), sessieStart: new Date() };
  }
  const totaal = cache.aantalWaarheid + cache.aantalDoen;
  const duur = Math.floor((new Date() - cache.sessieStart) / 60000);
  const uren = Math.floor(duur / 60);
  const minuten = duur % 60;
  const duurTekst = uren > 0 ? `${uren}u ${minuten}m` : `${minuten}m`;
  const rerollLijst = [...cache.rerollTeller.entries()]
    .sort((a, b) => b[1].teller - a[1].teller)
    .map(([, data], i) => `**${i + 1}.** ${data.naam} — ${data.teller}x reroll`)
    .join('\n');
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`📊 Statistieken — ${sessieNaam}`)
    .addFields(
      { name: '⏱️ Sessieduur', value: duurTekst, inline: true },
      { name: '🎮 Totaal gespeeld', value: `${totaal} rondes`, inline: true },
      { name: '​', value: '​', inline: true },
      { name: '🔵 Waarheid', value: `${cache.aantalWaarheid}x`, inline: true },
      { name: '🔴 Doen', value: `${cache.aantalDoen}x`, inline: true },
      { name: '​', value: '​', inline: true },
      { name: '🎲 Reroll ranglijst', value: rerollLijst || 'Nog niemand gererolld!', inline: false }
    )
    .setFooter({ text: `Sessie gestart om ${cache.sessieStart.toLocaleTimeString('nl-NL')}` })
    .setTimestamp();
}

export function buildLijstEmbeds(guildId, type) {
  const lijst = stmts.getVragen.all(guildId, type);
  const kleur = type === 'waarheid' ? 0x5865f2 : 0xed4245;
  const emoji = type === 'waarheid' ? '🔵' : '🔴';
  const label = type === 'waarheid' ? 'Waarheidsvragen' : 'Doe-opdrachten';
  if (lijst.length === 0) {
    return [new EmbedBuilder().setColor(kleur).setTitle(`${emoji} ${label}`).setDescription('Geen vragen gevonden.')];
  }
  const embeds = [];
  let huidigeTekst = '';
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

export function buildNooitEmbed(stelling, wel, nooit) {
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('🍺 Nooit heb ik...')
    .setDescription(`**${stelling}**\n\nKlik op een knop om te stemmen. Klik nogmaals om je stem in te trekken.`)
    .setFooter({ text: `${wel.size + nooit.size} stem${wel.size + nooit.size === 1 ? '' : 'men'} uitgebracht` });
}

export function buildNooitButtons(sessionId, welSize, nooitSize) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nooit_wel_${sessionId}`).setLabel(`🍺 Wel gedaan (${welSize})`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`nooit_nooit_${sessionId}`).setLabel(`✋ Nooit gedaan (${nooitSize})`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`nooit_sluit_${sessionId}`).setLabel('🔒 Sluit stemming').setStyle(ButtonStyle.Danger),
  );
}

export function buildLiefdestaalVraagEmbed(index) {
  const v = LIEFDESTAAL_VRAGEN[index];
  const voortgang = '█'.repeat(index) + '░'.repeat(LIEFDESTAAL_VRAGEN.length - index);
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`💕 Liefdestaal test — Vraag ${index + 1}/${LIEFDESTAAL_VRAGEN.length}`)
    .setDescription(`**${v.vraag}**\n\n🅰️ ${v.a.tekst}\n\n🅱️ ${v.b.tekst}`)
    .setFooter({ text: `Voortgang: ${voortgang}` });
}

export function buildLiefdestaalButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lt_A').setLabel('🅰️ A').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lt_B').setLabel('🅱️ B').setStyle(ButtonStyle.Secondary),
  );
}

export function buildLiefdestaalResultaatEmbed(user, antwoorden) {
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

export function buildPersoonlijkheidVraagEmbed(index) {
  const v = PERSOONLIJKHEID_VRAGEN[index];
  const voortgang = '█'.repeat(index) + '░'.repeat(PERSOONLIJKHEID_VRAGEN.length - index);
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🧠 Persoonlijkheidstest — Vraag ${index + 1}/${PERSOONLIJKHEID_VRAGEN.length}`)
    .setDescription(`**${v.vraag}**\n\n🅰️ ${v.a.tekst}\n\n🅱️ ${v.b.tekst}`)
    .setFooter({ text: `Voortgang: ${voortgang}` });
}

export function buildPersoonlijkheidButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pt_A').setLabel('🅰️ A').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pt_B').setLabel('🅱️ B').setStyle(ButtonStyle.Secondary),
  );
}

export function buildPersoonlijkheidResultaatEmbed(user, antwoorden) {
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

export function buildRelatieVraagEmbed(index, naam) {
  const v = RELATIE_VRAGEN[index];
  const voortgang = '█'.repeat(index) + '░'.repeat(RELATIE_VRAGEN.length - index);
  return new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle(`💑 Relatietest — Vraag ${index + 1}/${RELATIE_VRAGEN.length}`)
    .setDescription(`**${v.vraag}**\n\n🅰️ ${v.a}\n\n🅱️ ${v.b}`)
    .setFooter({ text: `${naam} • Voortgang: ${voortgang}` });
}

export function buildRelatieButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rt_A_${sessionId}`).setLabel('🅰️ A').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rt_B_${sessionId}`).setLabel('🅱️ B').setStyle(ButtonStyle.Secondary),
  );
}

export function buildRelatieResultaatEmbed(s) {
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


export function buildProfielEmbed(row, achievements, targetUser) {
  const lvlInfo = getLevelInfo(row.punten);
  const naam = row.user_naam;

  let voortgangBalk = '';
  if (lvlInfo.volgend) {
    const gevuld = Math.round(lvlInfo.voortgang / 10);
    voortgangBalk = `${'█'.repeat(gevuld)}${'░'.repeat(10 - gevuld)} ${row.punten}/${lvlInfo.volgend.min}`;
  } else {
    voortgangBalk = '██████████ MAX LEVEL';
  }

  const achCount = achievements.length;

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`👤 Profiel van ${naam}`)
    .addFields(
      { name: '🏅 Level', value: `Level ${lvlInfo.level} — ${lvlInfo.titel}`, inline: true },
      { name: '⭐ Punten', value: `${row.punten}`, inline: true },
      { name: '🏆 Achievements', value: `${achCount} behaald`, inline: true },
      { name: '📈 Voortgang', value: voortgangBalk, inline: false },
    )
    .setTimestamp();
}

export function buildLevelUpEmbed(user, levelInfo) {
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('🎉 Level Up!')
    .setDescription(
      `**${user.displayName ?? user.username}** is gestegen naar ` +
      `**Lv.${levelInfo.level} — ${levelInfo.titel}**!`
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();
}

export function buildRanglijstEmbed(rows) {
  if (rows.length === 0) {
    return new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🏆 Ranglijst')
      .setDescription('Nog niemand heeft punten verdiend. Speel een ronde met `/wod`!');
  }
  const regels = rows.map((row, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const lvl = getLevelInfo(row.punten);
    return `${medal} **${row.user_naam}** — ${row.punten} punten _(Lv.${lvl.level} ${lvl.titel})_`;
  });
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('🏆 Ranglijst — Top 10')
    .setDescription(regels.join('\n'))
    .setTimestamp();
}

export function buildAchievementsEmbed(guildId, userId, userNaam, behaaldList) {
  const ALLE = [
    { id: 'Eerste stap',   emoji: '👣', beschrijving: 'Voor het eerst punten ontvangen' },
    { id: 'Durfal',        emoji: '💪', beschrijving: 'Level 2 bereikt' },
    { id: 'Onthullingsmaster', emoji: '🔓', beschrijving: 'Level 3 bereikt' },
    { id: 'Legenda',       emoji: '👑', beschrijving: 'Level 4 bereikt' },
    { id: 'Reroll addict', emoji: '🎲', beschrijving: '10x gererolld' },
    { id: 'Lafaard',       emoji: '😅', beschrijving: '5x gepast' },
    { id: 'Op dreef',      emoji: '🔥', beschrijving: '3 rondes voltooid' },
    { id: 'Lovebird',      emoji: '💑', beschrijving: '/relatietest voltooid' },
    { id: 'Zelfinzicht',   emoji: '🧠', beschrijving: '/liefdestaal of /persoonlijkheid voltooid' },
  ];
  const behaaldSet = new Set(behaaldList.map(a => a.achievement));
  const regels = ALLE.map(a => {
    if (behaaldSet.has(a.id)) {
      const ts = behaaldList.find(b => b.achievement === a.id);
      const datum = ts ? new Date(ts.behaald_op * 1000).toLocaleDateString('nl-NL') : '';
      return `✅ ${a.emoji} **${a.id}** — ${a.beschrijving} _(${datum})_`;
    }
    return `🔒 ${a.emoji} **${a.id}** — ${a.beschrijving}`;
  });
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🏆 Achievements van ${userNaam}`)
    .setDescription(regels.join('\n'))
    .setTimestamp();
}

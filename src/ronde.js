import * as game from './game.js';
import * as embeds from './embeds.js';

// ─── Rondeknoppen ──────────────────────────────────────────────────────────────
// kies_<waarheid|doen|random>_<spelerId|open>, reroll_<type>_<spelerId>,
// passen_<type>_<spelerId>, nieuwe_ronde_<spelerId>

const KNOP_RE = /^(kies|reroll|passen)_(waarheid|doen|random)_(\d{17,20}|open)$/;
const NIEUWE_RONDE_RE = /^nieuwe_ronde_(\d{17,20})$/;
const LEGACY_IDS = new Set([
  'kies_waarheid', 'kies_doen', 'kies_random',
  'reroll_waarheid', 'reroll_doen', 'passen_waarheid', 'passen_doen', 'nieuwe_ronde',
]);

export function parseRondeKnop(customId) {
  if (LEGACY_IDS.has(customId)) return { legacy: true };
  const n = NIEUWE_RONDE_RE.exec(customId);
  if (n) return { actie: 'nieuwe', type: null, spelerId: n[1] };
  const m = KNOP_RE.exec(customId);
  if (!m) return null;
  const [, actie, type, spelerId] = m;
  // random en open bestaan alleen bij kies
  if (actie !== 'kies' && (type === 'random' || spelerId === 'open')) return null;
  return { actie, type, spelerId };
}

// ─── Dubbel klikken voorkomen ──────────────────────────────────────────────────
// Een bericht met rondeknoppen wordt maar één keer verwerkt.

const CLAIM_MS = 15 * 60 * 1000;
const geclaimd = new Set();

export function claimBericht(messageId) {
  if (geclaimd.has(messageId)) return false;
  geclaimd.add(messageId);
  setTimeout(() => geclaimd.delete(messageId), CLAIM_MS).unref();
  return true;
}

export function geefBerichtVrij(messageId) {
  geclaimd.delete(messageId);
}

// ─── Vraag kiezen en versturen ─────────────────────────────────────────────────

export function geenVraagMelding(type) {
  return type === 'waarheid' ? '❌ Geen waarheidsvragen beschikbaar.' : '❌ Geen doe-opdrachten beschikbaar.';
}

export function kiesVraag(guildId, channelId, type) {
  const sessieId = game.getSessieId(guildId, channelId);
  const catFilter = game.getCategorieFilter(guildId, channelId);
  return game.getVraag(guildId, type, catFilter, sessieId);
}

const DM_LABEL = {
  normaal: { waarheid: 'Vraag', doen: 'Opdracht' },
  reroll: { waarheid: 'Reroll', doen: 'Reroll' },
  straf: { waarheid: 'Strafvraag', doen: 'Strafopdracht' },
};

function buildVraagEmbed(type, variant, tekst, spelerNaam, guildId, sessieId) {
  if (variant === 'straf') {
    return type === 'waarheid'
      ? embeds.buildStrafWaarheidEmbed(tekst, spelerNaam, guildId, sessieId)
      : embeds.buildStrafDoenEmbed(tekst, spelerNaam, guildId, sessieId);
  }
  const isReroll = variant === 'reroll';
  return type === 'waarheid'
    ? embeds.buildWaarheidEmbed(tekst, spelerNaam, guildId, isReroll, sessieId)
    : embeds.buildDoenEmbed(tekst, spelerNaam, guildId, isReroll, sessieId);
}

// Stuurt een waarheid/doen-embed met actieknoppen voor de speler.
// Geeft false als er geen vraag was (de melding is dan al gestuurd).
export async function stuurVraag(interaction, { type, speler, variant, vraag = null, via }) {
  const guildId = interaction.guildId;
  const verstuur = (payload) => (via === 'reply' ? interaction.reply(payload) : interaction.followUp(payload));

  if (!vraag) vraag = kiesVraag(guildId, interaction.channelId, type);
  if (!vraag) {
    await verstuur({ content: geenVraagMelding(type), ephemeral: true });
    return false;
  }

  const sessieId = game.getSessieId(guildId, interaction.channelId);
  if (variant === 'normaal') {
    const cache = game.getSessieCache(sessieId);
    if (type === 'waarheid') cache.aantalWaarheid++;
    else cache.aantalDoen++;
    game.saveSessieCache(sessieId);
  }

  const embed = buildVraagEmbed(type, variant, vraag.tekst, speler.naam, guildId, sessieId);
  const components = [embeds.buildActieButtons(type, speler.id)];

  const inst = game.dbGetInstellingen(guildId);
  if (inst.dmModus || vraag.dm_modus) {
    let dmGelukt = false;
    try {
      await interaction.user.send({ embeds: [embed] });
      dmGelukt = true;
    } catch {
      // DM kan niet (DM's dicht): dan in het kanaal
    }
    if (dmGelukt) {
      await verstuur({ content: `📩 ${DM_LABEL[variant][type]} verstuurd via DM aan **${speler.naam}**!`, components });
      return true;
    }
  }
  await verstuur({ embeds: [embed], components });
  return true;
}

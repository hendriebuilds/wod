import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DATA_DIR } from './paden.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PAD = join(DATA_DIR, 'config.json');
// Tot v1.11.0 stond config.json naast de code (in productie gemount op /app/config.json)
const OUD_CONFIG_PAD = join(__dirname, '..', 'config.json');

export const config = {
  redirectUri: 'http://localhost:3001/auth/callback',
  frontendUrl: 'http://localhost:3001',
};

function leesConfig(pad) {
  return JSON.parse(readFileSync(pad, 'utf-8'));
}

// Geen err.message: bij een parsefout staat daar een stuk van de inhoud (en dus de URL) in
function foutReden(err) {
  return err instanceof SyntaxError ? 'geen geldige JSON' : (err.code || 'onbekende fout');
}

function heeftUrls(data) {
  return typeof data?.frontendUrl === 'string' && typeof data?.redirectUri === 'string';
}

// Een object, en frontendUrl/redirectUri zijn (als ze er staan) strings
function isGeldigeVorm(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    && ['frontendUrl', 'redirectUri'].every(k => data[k] === undefined || typeof data[k] === 'string');
}

// Een oud bestand met placeholders (zoals in de repo tot v1.11.0) telt niet mee
function isEchteConfig(data) {
  return heeftUrls(data) && !data.frontendUrl.includes('<') && !data.redirectUri.includes('<');
}

function panelUrlUitEnv() {
  return (process.env.PANEL_URL || '').trim().replace(/\/+$/, '');
}

// Alleen http(s), zonder inloggegevens, query of hash; geeft de URL zonder / aan het eind terug
function controleerPanelUrl(ruw) {
  try {
    const url = new URL(ruw);
    if ((url.protocol === 'http:' || url.protocol === 'https:')
      && !url.username && !url.password && !url.search && !url.hash) {
      return (url.origin + url.pathname).replace(/\/+$/, '');
    }
  } catch { /* hieronder afgehandeld */ }
  console.error('❌ PANEL_URL is geen geldige URL (alleen http of https, zonder ? of #). De bot stopt.');
  process.exit(1);
}

// Volgorde: config.json in de datamap → oud config.json naast de code → PANEL_URL → localhost.
// Log nooit de URL's zelf: logs worden soms gedeeld bij het vragen om hulp.
export function laadConfig() {
  const panelUrl = panelUrlUitEnv();

  if (existsSync(CONFIG_PAD)) {
    let data;
    try {
      data = leesConfig(CONFIG_PAD);
    } catch (err) {
      console.error(`❌ config.json in de datamap is ongeldig (${foutReden(err)}). De bot stopt.`);
      process.exit(1);
    }
    if (!isGeldigeVorm(data)) {
      console.error('❌ config.json in de datamap is ongeldig (frontendUrl en redirectUri moeten tekst zijn). De bot stopt.');
      process.exit(1);
    }
    Object.assign(config, data);
    console.log('✅ Configuratie geladen uit de datamap.');
    if (!heeftUrls(data)) {
      console.warn('⚠️ config.json in de datamap mist frontendUrl of redirectUri: daarvoor gelden de standaardwaarden voor localhost.');
    }
    if (panelUrl && panelUrl !== config.frontendUrl) {
      console.log('ℹ️ PANEL_URL wordt genegeerd: config.json in de datamap gaat voor.');
    }
    return;
  }

  if (existsSync(OUD_CONFIG_PAD)) {
    try {
      const oud = leesConfig(OUD_CONFIG_PAD);
      if (isEchteConfig(oud)) {
        Object.assign(config, oud);
        console.log(slaConfigOp()
          ? '✅ Configuratie overgenomen uit het oude config.json en opgeslagen in de datamap.'
          : '⚠️ Configuratie overgenomen uit het oude config.json, maar niet opgeslagen in de datamap.');
        if (panelUrl) console.log('ℹ️ PANEL_URL wordt genegeerd: het oude config.json gaat voor.');
        return;
      }
    } catch (err) {
      console.error(`⚠️ Oud config.json kon niet gelezen worden (${foutReden(err)}), wordt overgeslagen.`);
    }
  }

  if (panelUrl) {
    const url = controleerPanelUrl(panelUrl);
    config.frontendUrl = url;
    config.redirectUri = url + '/auth/callback';
    console.log(slaConfigOp()
      ? '✅ Configuratie aangemaakt vanuit PANEL_URL.'
      : '⚠️ Configuratie uit PANEL_URL gebruikt, maar niet opgeslagen in de datamap.');
    return;
  }

  console.warn('⚠️ Geen config.json en geen PANEL_URL: het panel gebruikt http://localhost:3001. Inloggen via een ander adres werkt dan niet.');
}

// Geeft true terug als het bestand is geschreven
export function slaConfigOp() {
  try {
    writeFileSync(CONFIG_PAD, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`❌ Fout bij opslaan configuratie (${foutReden(err)}).`);
    return false;
  }
}

export const SUPERADMIN_IDS = (process.env.SUPERADMIN_IDS || process.env.SUPERADMIN_ID || '')
  .split(',').map(s => s.trim()).filter(Boolean);

export function isSuperAdmin(userId) {
  return SUPERADMIN_IDS.length > 0 && SUPERADMIN_IDS.includes(userId);
}

laadConfig();

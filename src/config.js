import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PAD = join(__dirname, '..', 'config.json');

export const config = {
  redirectUri: 'http://localhost:3001/auth/callback',
  frontendUrl: 'http://localhost:3001',
};

export function laadConfig() {
  try {
    const data = JSON.parse(readFileSync(CONFIG_PAD, 'utf-8'));
    Object.assign(config, data);
    console.log('✅ Configuratie geladen.');
  } catch {
    console.log('ℹ️ Geen config.json, standaardwaarden gebruikt.');
  }
}

export function slaConfigOp() {
  try {
    writeFileSync(CONFIG_PAD, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('❌ Fout bij opslaan configuratie:', err.message);
  }
}

export const SUPERADMIN_IDS = (process.env.SUPERADMIN_IDS || process.env.SUPERADMIN_ID || '')
  .split(',').map(s => s.trim()).filter(Boolean);

export function isSuperAdmin(userId) {
  return SUPERADMIN_IDS.length > 0 && SUPERADMIN_IDS.includes(userId);
}

laadConfig();

import session from 'express-session';
import { stmts } from './database.js';

// Sessies van het panel in SQLite (tabel panel_sessies), zodat een login een
// herstart overleeft. verloopt = ms sinds epoch.

const STANDAARD_DUUR = 24 * 60 * 60 * 1000;
const OPRUIM_INTERVAL = 15 * 60 * 1000;

function verlooptOp(sess) {
  const expires = sess?.cookie?.expires;
  const ms = expires ? new Date(expires).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Date.now() + STANDAARD_DUUR;
}

export class SqliteStore extends session.Store {
  constructor() {
    super();
    setInterval(() => {
      try {
        const { changes } = stmts.opruimenPanelSessies.run(Date.now());
        if (changes > 0) console.log(`🧹 ${changes} verlopen panelsessie(s) opgeruimd.`);
      } catch (err) {
        console.error('Opruimen van panelsessies mislukt:', err);
      }
    }, OPRUIM_INTERVAL).unref();
  }

  get(sid, cb) {
    try {
      const rij = stmts.getPanelSessie.get(sid);
      if (!rij) return cb(null, null);
      if (rij.verloopt <= Date.now()) {
        stmts.deletePanelSessie.run(sid);
        return cb(null, null);
      }
      let sess;
      try {
        sess = JSON.parse(rij.sess);
      } catch {
        stmts.deletePanelSessie.run(sid);
        return cb(null, null);
      }
      cb(null, sess);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb = () => {}) {
    try {
      stmts.upsertPanelSessie.run(sid, JSON.stringify(sess), verlooptOp(sess));
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb = () => {}) {
    try {
      stmts.deletePanelSessie.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb = () => {}) {
    try {
      stmts.touchPanelSessie.run(verlooptOp(sess), sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

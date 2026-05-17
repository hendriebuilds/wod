import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Configuratie() {
  const [values, setValues] = useState({ redirectUri: '', frontendUrl: '' });
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    api.getConfig().then(setValues).catch(() => {});
  }, []);

  const toon = (msg, type = 'success') => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const opslaan = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.updateConfig(values);
      setValues(updated);
      toon('Configuratie opgeslagen! Log opnieuw in om wijzigingen te activeren.');
    } catch {
      toon('Opslaan mislukt.', 'error');
    }
  };

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '8px' }}>🔧 Configuratie</h1>
      <p className="muted" style={{ marginBottom: '24px' }}>
        Instellingen voor het admin panel. De bot token en client credentials blijven in <code>.env</code>.
      </p>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      <div className="card">
        <form onSubmit={opslaan}>
          <div className="form-group">
            <label className="form-label">OAuth Redirect URI</label>
            <input
              type="url"
              className="form-input"
              value={values.redirectUri}
              onChange={e => setValues(v => ({ ...v, redirectUri: e.target.value }))}
              placeholder="http://jouwserver:3001/auth/callback"
            />
            <p className="form-hint">
              Moet exact overeenkomen met wat je in de Discord Developer Portal hebt ingesteld.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Frontend URL</label>
            <input
              type="url"
              className="form-input"
              value={values.frontendUrl}
              onChange={e => setValues(v => ({ ...v, frontendUrl: e.target.value }))}
              placeholder="http://jouwserver:3001"
            />
            <p className="form-hint">
              Het adres waarop het admin panel bereikbaar is. Discord stuurt hiernaar terug na inloggen.
            </p>
          </div>

          <button type="submit" className="btn btn-primary">💾 Opslaan</button>
        </form>
      </div>

      <div className="card" style={{ borderLeft: '3px solid var(--blurple)' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '14px' }}>ℹ️ Meerdere servers</h3>
        <p className="muted" style={{ lineHeight: '1.6' }}>
          De bot werkt automatisch op alle servers waar hij is uitgenodigd. Iedereen met
          <strong> Manage Server</strong>-rechten op zo'n server kan inloggen op het admin panel.
          Vragen zijn op dit moment gedeeld tussen alle servers.
        </p>
      </div>
    </div>
  );
}

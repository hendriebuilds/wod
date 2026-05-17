import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Instellingen() {
  const [values, setValues] = useState({ cooldownMs: 1500, dmModus: false });
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    api.getInstellingen().then(setValues).catch(() => {});
  }, []);

  const opslaan = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.updateInstellingen(values);
      setValues(updated);
      setFeedback({ type: 'success', msg: 'Instellingen opgeslagen!' });
    } catch {
      setFeedback({ type: 'error', msg: 'Opslaan mislukt.' });
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '24px' }}>⚙️ Instellingen</h1>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      <div className="card">
        <form onSubmit={opslaan}>
          <div className="form-group">
            <label className="form-label">Cooldown (milliseconden)</label>
            <input
              type="number"
              className="form-input"
              value={values.cooldownMs}
              min={0}
              max={10000}
              step={100}
              onChange={e => setValues(v => ({ ...v, cooldownMs: parseInt(e.target.value) || 0 }))}
              style={{ maxWidth: '200px' }}
            />
            <p className="form-hint">
              Wachttijd tussen knopklikken per gebruiker. Huidig: {(values.cooldownMs / 1000).toFixed(1)}s
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">DM-modus</label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={values.dmModus ?? false}
                onChange={e => setValues(v => ({ ...v, dmModus: e.target.checked }))}
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
            </label>
            <p className="form-hint">
              Stuur vragen privé via DM in plaats van in het kanaal. De actieknoppen blijven zichtbaar in het kanaal.
            </p>
          </div>

          <button type="submit" className="btn btn-primary">💾 Opslaan</button>
        </form>
      </div>
    </div>
  );
}

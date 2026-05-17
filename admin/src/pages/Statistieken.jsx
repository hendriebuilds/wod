import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Statistieken() {
  const [stats, setStats] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const toon = (msg, type = 'success') => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const laad = async () => {
    try {
      setStats(await api.getStats());
    } catch {
      toon('Laden mislukt.', 'error');
    }
  };

  useEffect(() => { laad(); }, []);

  const reset = async () => {
    if (!confirm('Alle statistieken en gebruikte vragen resetten?')) return;
    try {
      await api.resetStats();
      await laad();
      toon('Statistieken gereset!');
    } catch {
      toon('Reset mislukt.', 'error');
    }
  };

  const reload = async () => {
    try {
      const res = await api.reload();
      toon(res.ok ? 'Vragen herladen!' : 'Herladen mislukt.', res.ok ? 'success' : 'error');
      if (res.ok) await laad();
    } catch {
      toon('Herladen mislukt.', 'error');
    }
  };

  const duurTekst = (start) => {
    const min = Math.floor((Date.now() - new Date(start)) / 60000);
    const u = Math.floor(min / 60);
    const m = min % 60;
    return u > 0 ? `${u}u ${m}m` : `${m}m`;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📊 Statistieken</h1>
        <div className="action-row">
          <button className="btn btn-ghost" onClick={reload}>🔄 Vragen herladen</button>
          <button className="btn btn-danger" onClick={reset}>🗑️ Reset sessie</button>
        </div>
      </div>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      {!stats ? (
        <p className="muted">Laden...</p>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{duurTekst(stats.sessieStart)}</div>
              <div className="stat-label">Sessieduur</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.aantalWaarheid + stats.aantalDoen}</div>
              <div className="stat-label">Totaal gespeeld</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#5865f2' }}>{stats.aantalWaarheid}</div>
              <div className="stat-label">🔵 Waarheid</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#ed4245' }}>{stats.aantalDoen}</div>
              <div className="stat-label">🔴 Doen</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.waarheidTotaal}</div>
              <div className="stat-label">Waarheidsvragen totaal</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.doenTotaal}</div>
              <div className="stat-label">Doe-opdrachten totaal</div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: '16px', fontSize: '16px' }}>🎲 Reroll ranglijst</h2>
            {Object.keys(stats.rerollTeller).length === 0 ? (
              <p className="muted">Nog niemand gererolld.</p>
            ) : (
              <div className="question-list">
                {Object.values(stats.rerollTeller)
                  .sort((a, b) => b.teller - a.teller)
                  .map((item, i) => (
                    <div key={i} className="question-item">
                      <span className="question-num">#{i + 1}</span>
                      <span className="question-text">{item.naam}</span>
                      <span className="muted">{item.teller}× reroll</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

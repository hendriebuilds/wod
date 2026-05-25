import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Statistieken() {
  const [data, setData] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const toon = (msg, type = 'success') => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const laad = async () => {
    try {
      setData(await api.getStats());
    } catch {
      toon('Laden mislukt.', 'error');
    }
  };

  useEffect(() => { laad(); }, []);

  const reset = async () => {
    if (!confirm('Alle actieve sessies beëindigen en statistieken resetten?')) return;
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

  // Bereken totalen over alle sessies
  const totalen = data?.sessies ? {
    aantalWaarheid: data.sessies.reduce((sum, s) => sum + s.aantalWaarheid, 0),
    aantalDoen: data.sessies.reduce((sum, s) => sum + s.aantalDoen, 0),
  } : null;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📊 Statistieken</h1>
        <div className="action-row">
          <button className="btn btn-ghost" onClick={reload}>🔄 Vragen herladen</button>
          <button className="btn btn-danger" onClick={reset}>🗑️ Reset sessies</button>
        </div>
      </div>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      {!data ? (
        <p className="muted">Laden...</p>
      ) : (
        <>
          {/* Totaaloverzicht */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{data.sessies?.length ?? 0}</div>
              <div className="stat-label">Actieve sessies</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{(totalen?.aantalWaarheid ?? 0) + (totalen?.aantalDoen ?? 0)}</div>
              <div className="stat-label">Totaal gespeeld</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#5865f2' }}>{totalen?.aantalWaarheid ?? 0}</div>
              <div className="stat-label">🔵 Waarheid totaal</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#ed4245' }}>{totalen?.aantalDoen ?? 0}</div>
              <div className="stat-label">🔴 Doen totaal</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.waarheidTotaal}</div>
              <div className="stat-label">Waarheidsvragen beschikbaar</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.doenTotaal}</div>
              <div className="stat-label">Doe-opdrachten beschikbaar</div>
            </div>
          </div>

          {/* Per sessie */}
          {data.sessies && data.sessies.length === 0 ? (
            <div className="card">
              <p className="muted">Geen actieve of gepauzeerde sessies. Start een spel via Discord met <code>/wod</code>.</p>
            </div>
          ) : (
            data.sessies?.map(sessie => (
              <div key={sessie.id} className="card" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h2 style={{ fontSize: '16px', margin: 0 }}>
                    {sessie.status === 'actief' ? '🟢' : '🟡'} {sessie.naam}
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--muted, #888)', fontWeight: 400 }}>
                      ID #{sessie.id} • <code style={{ fontSize: '11px' }}>{sessie.channelId}</code>
                    </span>
                  </h2>
                  <span style={{ fontSize: '12px', color: 'var(--muted, #888)' }}>
                    Duur: {duurTekst(sessie.sessieStart)}
                  </span>
                </div>

                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  <div className="stat-card" style={{ padding: '10px' }}>
                    <div className="stat-value" style={{ fontSize: '20px' }}>{sessie.aantalWaarheid + sessie.aantalDoen}</div>
                    <div className="stat-label" style={{ fontSize: '11px' }}>Rondes</div>
                  </div>
                  <div className="stat-card" style={{ padding: '10px' }}>
                    <div className="stat-value" style={{ fontSize: '20px', color: '#5865f2' }}>{sessie.aantalWaarheid}</div>
                    <div className="stat-label" style={{ fontSize: '11px' }}>Waarheid</div>
                  </div>
                  <div className="stat-card" style={{ padding: '10px' }}>
                    <div className="stat-value" style={{ fontSize: '20px', color: '#ed4245' }}>{sessie.aantalDoen}</div>
                    <div className="stat-label" style={{ fontSize: '11px' }}>Doen</div>
                  </div>
                </div>

                <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>🎲 Reroll ranglijst</h3>
                {Object.keys(sessie.rerollTeller).length === 0 ? (
                  <p className="muted" style={{ fontSize: '13px' }}>Nog niemand gererolld.</p>
                ) : (
                  <div className="question-list">
                    {Object.values(sessie.rerollTeller)
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
            ))
          )}
        </>
      )}
    </div>
  );
}

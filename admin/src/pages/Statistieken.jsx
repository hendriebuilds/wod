import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

export default function Statistieken() {
  const { t } = useLanguage();
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
      toon(t('stats.ladenMislukt'), 'error');
    }
  };

  useEffect(() => { laad(); }, []);

  const reset = async () => {
    if (!confirm(t('stats.resetConfirm'))) return;
    try {
      await api.resetStats();
      await laad();
      toon(t('stats.gereset'));
    } catch {
      toon(t('stats.resetMislukt'), 'error');
    }
  };

  const reload = async () => {
    try {
      const res = await api.reload();
      toon(res.ok ? t('stats.herlaadSuccess') : t('stats.herlaadMislukt'), res.ok ? 'success' : 'error');
      if (res.ok) await laad();
    } catch {
      toon(t('stats.herlaadMislukt'), 'error');
    }
  };

  const duurTekst = (start) => {
    const min = Math.floor((Date.now() - new Date(start)) / 60000);
    const u = Math.floor(min / 60);
    const m = min % 60;
    return u > 0 ? `${u}u ${m}m` : `${m}m`;
  };

  const totalen = data?.sessies ? {
    aantalWaarheid: data.sessies.reduce((sum, s) => sum + s.aantalWaarheid, 0),
    aantalDoen: data.sessies.reduce((sum, s) => sum + s.aantalDoen, 0),
  } : null;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('stats.title')}</h1>
        <div className="action-row">
          <button className="btn btn-ghost" onClick={reload}>{t('stats.vragenHerladen')}</button>
          <button className="btn btn-danger" onClick={reset}>{t('stats.resetSessies')}</button>
        </div>
      </div>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      {!data ? (
        <p className="muted">{t('laden')}</p>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{data.sessies?.length ?? 0}</div>
              <div className="stat-label">{t('stats.activeSessies')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{(totalen?.aantalWaarheid ?? 0) + (totalen?.aantalDoen ?? 0)}</div>
              <div className="stat-label">{t('stats.totaalGespeeld')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#5865f2' }}>{totalen?.aantalWaarheid ?? 0}</div>
              <div className="stat-label">{t('stats.waarheidTotaal')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#ed4245' }}>{totalen?.aantalDoen ?? 0}</div>
              <div className="stat-label">{t('stats.doenTotaal')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.waarheidTotaal}</div>
              <div className="stat-label">{t('stats.waarheidBeschikbaar')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.doenTotaal}</div>
              <div className="stat-label">{t('stats.doenBeschikbaar')}</div>
            </div>
          </div>

          {data.sessies && data.sessies.length === 0 ? (
            <div className="card">
              <p className="muted">{t('stats.geenSessies')}</p>
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
                    {t('stats.duur', { time: duurTekst(sessie.sessieStart) })}
                  </span>
                </div>

                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  <div className="stat-card" style={{ padding: '10px' }}>
                    <div className="stat-value" style={{ fontSize: '20px' }}>{sessie.aantalWaarheid + sessie.aantalDoen}</div>
                    <div className="stat-label" style={{ fontSize: '11px' }}>{t('stats.rondes')}</div>
                  </div>
                  <div className="stat-card" style={{ padding: '10px' }}>
                    <div className="stat-value" style={{ fontSize: '20px', color: '#5865f2' }}>{sessie.aantalWaarheid}</div>
                    <div className="stat-label" style={{ fontSize: '11px' }}>{t('stats.waarheid')}</div>
                  </div>
                  <div className="stat-card" style={{ padding: '10px' }}>
                    <div className="stat-value" style={{ fontSize: '20px', color: '#ed4245' }}>{sessie.aantalDoen}</div>
                    <div className="stat-label" style={{ fontSize: '11px' }}>{t('stats.doen')}</div>
                  </div>
                </div>

                <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>{t('stats.rerollRanglijst')}</h3>
                {Object.keys(sessie.rerollTeller).length === 0 ? (
                  <p className="muted" style={{ fontSize: '13px' }}>{t('stats.niemandGererolld')}</p>
                ) : (
                  <div className="question-list">
                    {Object.values(sessie.rerollTeller)
                      .sort((a, b) => b.teller - a.teller)
                      .map((item, i) => (
                        <div key={i} className="question-item">
                          <span className="question-num">#{i + 1}</span>
                          <span className="question-text">{item.naam}</span>
                          <span className="muted">{t('stats.rerollTelling', { count: item.teller })}</span>
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

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const STATUS_EMOJI = {
  actief: '🟢',
  gepauzeerd: '🟡',
  beeindigd: '🔴',
};

export default function Sessies() {
  const { t, strings } = useLanguage();
  const [sessies, setSessies] = useState([]);
  const [filter, setFilter] = useState('alle');
  const [feedback, setFeedback] = useState(null);
  const [bezig, setBezig] = useState(null);

  const STATUS_LABEL = {
    actief: t('sessies.statusActief'),
    gepauzeerd: t('sessies.statusGepauzeerd'),
    beeindigd: t('sessies.statusBeeindigd'),
  };

  const toon = (msg, type = 'success') => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const laad = useCallback(async () => {
    try {
      setSessies(await api.getSessies());
    } catch {
      toon(t('sessies.ladenMislukt'), 'error');
    }
  }, [t]);

  useEffect(() => {
    laad();
    const interval = setInterval(laad, 30000);
    return () => clearInterval(interval);
  }, [laad]);

  const beeindig = async (id) => {
    if (!confirm(t('sessies.beeindigConfirm'))) return;
    setBezig(id);
    try {
      await api.deleteSessie(id);
      toon(t('sessies.beeindigd'));
      await laad();
    } catch {
      toon(t('sessies.beeindigenMislukt'), 'error');
    } finally {
      setBezig(null);
    }
  };

  const gefilterd = sessies.filter(s => filter === 'alle' || s.status === filter);

  const formatDatum = (iso) => {
    try {
      return new Date(iso).toLocaleString(strings.locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('sessies.title')}</h1>
        <div className="action-row">
          <button className="btn btn-ghost" onClick={laad}>{t('sessies.vernieuwen')}</button>
        </div>
      </div>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      <div className="action-row" style={{ marginBottom: '16px', gap: '8px', flexWrap: 'wrap' }}>
        {['alle', 'actief', 'gepauzeerd', 'beeindigd'].map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'alle' ? t('sessies.alle') : STATUS_EMOJI[f] + ' ' + STATUS_LABEL[f]}
            <span style={{ marginLeft: '6px', opacity: 0.7 }}>
              ({sessies.filter(s => f === 'alle' || s.status === f).length})
            </span>
          </button>
        ))}
      </div>

      {gefilterd.length === 0 ? (
        <p className="muted">
          {filter === 'alle'
            ? t('sessies.geenSessies')
            : t('sessies.geenStatusSessies', { status: STATUS_LABEL[filter]?.toLowerCase() ?? filter })}
        </p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2, #2b2d31)', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('sessies.colId')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('sessies.colNaam')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('sessies.colKanaal')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('sessies.colStatus')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('sessies.colRondes')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('sessies.colGestart')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('sessies.colActies')}</th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.map((s, i) => (
                <tr
                  key={s.id}
                  style={{
                    borderTop: i > 0 ? '1px solid var(--border, #3f4147)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <td style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--muted, #888)' }}>#{s.id}</td>
                  <td style={{ padding: '10px 14px', fontSize: '14px', fontWeight: 500 }}>{s.naam}</td>
                  <td style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--muted, #888)', fontFamily: 'monospace' }}>
                    {s.channel_id}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '13px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: s.status === 'actief' ? 'rgba(87,242,135,0.15)' : s.status === 'gepauzeerd' ? 'rgba(254,231,92,0.15)' : 'rgba(237,66,69,0.15)',
                      color: s.status === 'actief' ? '#57f287' : s.status === 'gepauzeerd' ? '#fee75c' : '#ed4245',
                    }}>
                      {STATUS_EMOJI[s.status]} {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '13px' }}>
                    <span style={{ color: '#5865f2', fontWeight: 600 }}>{s.aantal_waarheid}W</span>
                    {' / '}
                    <span style={{ color: '#ed4245', fontWeight: 600 }}>{s.aantal_doen}D</span>
                    {' '}
                    <span style={{ color: 'var(--muted, #888)', fontSize: '12px' }}>
                      ({s.aantal_waarheid + s.aantal_doen} totaal)
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--muted, #888)' }}>
                    {formatDatum(s.sessie_start_iso)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {s.status !== 'beeindigd' && (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        onClick={() => beeindig(s.id)}
                        disabled={bezig === s.id}
                      >
                        {bezig === s.id ? '...' : t('sessies.beeindigBtn')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ marginTop: '12px', fontSize: '12px' }}>
        {t('sessies.autoVernieuwen')}
      </p>
    </div>
  );
}

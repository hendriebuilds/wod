import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

export default function Ranglijst() {
  const { t, strings } = useLanguage();
  const levelNamen = strings['ranglijst.levelNamen'];
  const [data, setData] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const toon = (msg, type = 'success') => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  useEffect(() => {
    api.getRanglijst()
      .then(setData)
      .catch(() => toon(t('ranglijst.ladenMislukt'), 'error'));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('ranglijst.title')}</h1>
      </div>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      {!data ? (
        <p className="muted">{t('laden')}</p>
      ) : data.length === 0 ? (
        <div className="card">
          <p className="muted">{t('ranglijst.geenData')}</p>
        </div>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #2e3035)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--muted, #888)' }}>{t('ranglijst.colRank')}</th>
                <th style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--muted, #888)' }}>{t('ranglijst.colSpeler')}</th>
                <th style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--muted, #888)' }}>{t('ranglijst.colPunten')}</th>
                <th style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--muted, #888)' }}>{t('ranglijst.colLevel')}</th>
                <th style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--muted, #888)' }}>{t('ranglijst.colAchievements')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.user_id} style={{ borderBottom: '1px solid var(--border, #2e3035)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: i < 3 ? ['#ffd700','#c0c0c0','#cd7f32'][i] : undefined }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.user_naam}</td>
                  <td style={{ padding: '10px 12px' }}>{row.punten}</td>
                  <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                    <span style={{ opacity: 0.7 }}>Lv.{row.level}</span> {levelNamen[row.level] ?? ''}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--muted, #888)' }}>
                    {row.achievement_count ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

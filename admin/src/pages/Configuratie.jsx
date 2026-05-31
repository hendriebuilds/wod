import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

export default function Configuratie() {
  const { t } = useLanguage();
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
      toon(t('configuratie.opgeslagen'));
    } catch {
      toon(t('configuratie.opslaanMislukt'), 'error');
    }
  };

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '8px' }}>{t('configuratie.title')}</h1>
      <p className="muted" style={{ marginBottom: '24px' }}>
        {t('configuratie.subtitle')}
      </p>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      <div className="card">
        <form onSubmit={opslaan}>
          <div className="form-group">
            <label className="form-label">{t('configuratie.redirectUri')}</label>
            <input
              type="url"
              className="form-input"
              value={values.redirectUri}
              onChange={e => setValues(v => ({ ...v, redirectUri: e.target.value }))}
              placeholder="http://jouwserver:3001/auth/callback"
            />
            <p className="form-hint">{t('configuratie.redirectHint')}</p>
          </div>

          <div className="form-group">
            <label className="form-label">{t('configuratie.frontendUrl')}</label>
            <input
              type="url"
              className="form-input"
              value={values.frontendUrl}
              onChange={e => setValues(v => ({ ...v, frontendUrl: e.target.value }))}
              placeholder="http://jouwserver:3001"
            />
            <p className="form-hint">{t('configuratie.frontendHint')}</p>
          </div>

          <button type="submit" className="btn btn-primary">{t('configuratie.opslaan')}</button>
        </form>
      </div>

      <div className="card" style={{ borderLeft: '3px solid var(--blurple)' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '14px' }}>{t('configuratie.meerServersTitle')}</h3>
        <p className="muted" style={{ lineHeight: '1.6' }}>
          {t('configuratie.meerServersText1')}
          <strong> {t('configuratie.meerServersManage')}</strong>
          {t('configuratie.meerServersText2')}
        </p>
      </div>
    </div>
  );
}

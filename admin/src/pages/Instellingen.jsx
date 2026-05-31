import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

export default function Instellingen() {
  const { t } = useLanguage();
  const [values, setValues] = useState({
    cooldownMs: 1500,
    dmModus: false,
    autoCategorieMappen: false,
    categoriePerChat: false,
  });
  const [feedback, setFeedback] = useState(null);

  const [kanalen, setKanalen] = useState([]);
  const [categorieen, setCategorieen] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [nieuwMapping, setNieuwMapping] = useState({ channelId: '', categorie: '' });

  const [aanmaakBezig, setAanmaakBezig] = useState(false);
  const [resetBezig, setResetBezig] = useState(false);
  const [bevestigReset, setBevestigReset] = useState(false);

  useEffect(() => {
    api.getInstellingen().then(setValues).catch(() => {});
    laadChannelData();
  }, []);

  async function laadChannelData() {
    try {
      const [k, c, m] = await Promise.all([
        api.getKanalen(),
        api.getCategorieen(),
        api.getChannelCategorie(),
      ]);
      setKanalen(k);
      setCategorieen(c);
      setMappings(m);
      if (c.length > 0) setNieuwMapping(v => ({ ...v, categorie: c[0] }));
    } catch {}
  }

  const opslaan = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.updateInstellingen(values);
      setValues(updated);
      setFeedback({ type: 'success', msg: t('instellingen.opgeslagen') });
    } catch {
      setFeedback({ type: 'error', msg: t('instellingen.opslaanMislukt') });
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  const maakCategorieMappen = async () => {
    setAanmaakBezig(true);
    try {
      const result = await api.createCategorieMappen();
      setFeedback({ type: 'success', msg: t('instellingen.aanmaakSuccess', { count: result.aangemaakt.length }) });
      await laadChannelData();
      const updated = await api.getInstellingen();
      setValues(updated);
    } catch (err) {
      setFeedback({ type: 'error', msg: t('instellingen.aanmaakMislukt', { error: err.message || t('onbekendeFout') }) });
    }
    setAanmaakBezig(false);
    setTimeout(() => setFeedback(null), 5000);
  };

  const voegMappingToe = async () => {
    if (!nieuwMapping.channelId || !nieuwMapping.categorie) return;
    try {
      await api.setChannelCategorie(nieuwMapping.channelId, nieuwMapping.categorie);
      await laadChannelData();
      setNieuwMapping(v => ({ ...v, channelId: '' }));
    } catch {
      setFeedback({ type: 'error', msg: t('instellingen.mappingMislukt') });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const verwijderMapping = async (channelId) => {
    try {
      await api.deleteChannelCategorie(channelId);
      setMappings(m => m.filter(x => x.channel_id !== channelId));
    } catch {
      setFeedback({ type: 'error', msg: t('instellingen.verwijderenMislukt') });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const resetConfig = async () => {
    setResetBezig(true);
    try {
      await api.resetConfig();
      const updated = await api.getInstellingen();
      setValues(updated);
      await laadChannelData();
      setBevestigReset(false);
      setFeedback({ type: 'success', msg: t('instellingen.resetSuccess') });
    } catch {
      setFeedback({ type: 'error', msg: t('instellingen.resetMislukt') });
    }
    setResetBezig(false);
    setTimeout(() => setFeedback(null), 4000);
  };

  const getKanaalNaam = (channelId) => {
    const k = kanalen.find(c => c.id === channelId);
    return k ? `#${k.name}${k.parentName ? ` (${k.parentName})` : ''}` : `#${channelId}`;
  };

  const ongemapteKanalen = kanalen.filter(k => !mappings.some(m => m.channel_id === k.id));

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '24px' }}>{t('instellingen.title')}</h1>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      <div className="card">
        <form onSubmit={opslaan}>
          <div className="form-group">
            <label className="form-label">{t('instellingen.cooldown')}</label>
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
              {t('instellingen.cooldownHint', { time: (values.cooldownMs / 1000).toFixed(1) })}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">{t('instellingen.dmModus')}</label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={values.dmModus ?? false}
                onChange={e => setValues(v => ({ ...v, dmModus: e.target.checked }))}
              />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
            <p className="form-hint">{t('instellingen.dmHint')}</p>
          </div>

          <div className="form-group">
            <label className="form-label">{t('instellingen.autoCategorie')}</label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={values.autoCategorieMappen ?? false}
                onChange={e => setValues(v => ({ ...v, autoCategorieMappen: e.target.checked }))}
              />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
            <p className="form-hint">{t('instellingen.autoCategorieHint')}</p>
          </div>

          <div className="form-group">
            <label className="form-label">{t('instellingen.categoriePerChat')}</label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={values.categoriePerChat ?? false}
                onChange={e => setValues(v => ({ ...v, categoriePerChat: e.target.checked }))}
              />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
            <p className="form-hint">{t('instellingen.categoriePerChatHint')}</p>
          </div>

          <button type="submit" className="btn btn-primary">{t('instellingen.opslaan')}</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>{t('instellingen.categorieMappenTitle')}</h2>
        <p className="form-hint" style={{ marginBottom: '12px' }}>
          {t('instellingen.categorieMappenHint')}
        </p>
        <button
          className="btn btn-primary"
          onClick={maakCategorieMappen}
          disabled={aanmaakBezig}
        >
          {aanmaakBezig ? t('instellingen.bezig') : t('instellingen.maakMappen')}
        </button>
      </div>

      {values.categoriePerChat && (
        <div className="card" style={{ marginTop: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>{t('instellingen.koppelTitle')}</h2>
          <p className="form-hint" style={{ marginBottom: '16px' }}>
            {t('instellingen.koppelHint')}
          </p>

          {mappings.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('instellingen.colKanaal')}</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('instellingen.colCategorie')}</th>
                  <th style={{ padding: '6px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.channel_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{getKanaalNaam(m.channel_id)}</td>
                    <td style={{ padding: '6px 8px' }}><span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '12px' }}>{m.categorie}</span></td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => verwijderMapping(m.channel_id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {ongemapteKanalen.length > 0 && categorieen.length > 0 ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-select"
                value={nieuwMapping.channelId}
                onChange={e => setNieuwMapping(v => ({ ...v, channelId: e.target.value }))}
                style={{ flex: '1', minWidth: '160px' }}
              >
                <option value="">{t('instellingen.kiesKanaal')}</option>
                {ongemapteKanalen.map(k => (
                  <option key={k.id} value={k.id}>#{k.name}{k.parentName ? ` (${k.parentName})` : ''}</option>
                ))}
              </select>
              <select
                className="form-select"
                value={nieuwMapping.categorie}
                onChange={e => setNieuwMapping(v => ({ ...v, categorie: e.target.value }))}
                style={{ flex: '1', minWidth: '120px' }}
              >
                {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn btn-primary" onClick={voegMappingToe} disabled={!nieuwMapping.channelId}>
                {t('instellingen.koppelen')}
              </button>
            </div>
          ) : (
            categorieen.length === 0
              ? <p className="form-hint">{t('instellingen.geenCategorieen')}</p>
              : <p className="form-hint">{t('instellingen.alleGekoppeld')}</p>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: '24px', borderColor: 'var(--danger, #ed4245)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>{t('instellingen.resetTitle')}</h2>
        <p className="form-hint" style={{ marginBottom: '12px' }}>
          {t('instellingen.resetHint')}
        </p>
        {!bevestigReset ? (
          <button className="btn btn-danger" onClick={() => setBevestigReset(true)}>
            {t('instellingen.resetBtn')}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px' }}>{t('instellingen.resetConfirm')}</span>
            <button className="btn btn-danger" onClick={resetConfig} disabled={resetBezig}>
              {resetBezig ? t('instellingen.bezig') : t('instellingen.resetJa')}
            </button>
            <button className="btn" onClick={() => setBevestigReset(false)}>{t('instellingen.annuleer')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

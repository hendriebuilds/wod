import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Instellingen() {
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
      setFeedback({ type: 'success', msg: 'Instellingen opgeslagen!' });
    } catch {
      setFeedback({ type: 'error', msg: 'Opslaan mislukt.' });
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  const maakCategorieMappen = async () => {
    setAanmaakBezig(true);
    try {
      const result = await api.createCategorieMappen();
      setFeedback({ type: 'success', msg: `✅ ${result.aangemaakt.length} kanaal/kanalen aangemaakt!` });
      await laadChannelData();
      const updated = await api.getInstellingen();
      setValues(updated);
    } catch (err) {
      setFeedback({ type: 'error', msg: 'Aanmaken mislukt: ' + (err.message || 'onbekende fout') });
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
      setFeedback({ type: 'error', msg: 'Mapping toevoegen mislukt.' });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const verwijderMapping = async (channelId) => {
    try {
      await api.deleteChannelCategorie(channelId);
      setMappings(m => m.filter(x => x.channel_id !== channelId));
    } catch {
      setFeedback({ type: 'error', msg: 'Verwijderen mislukt.' });
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
      setFeedback({ type: 'success', msg: 'Configuratie gereset naar standaardwaarden.' });
    } catch {
      setFeedback({ type: 'error', msg: 'Reset mislukt.' });
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
      <h1 className="page-title" style={{ marginBottom: '24px' }}>⚙️ Instellingen</h1>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      {/* Algemene instellingen */}
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
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
            <p className="form-hint">
              Stuur vragen privé via DM in plaats van in het kanaal.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Automatische Categoriemap Creëren</label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={values.autoCategorieMappen ?? false}
                onChange={e => setValues(v => ({ ...v, autoCategorieMappen: e.target.checked }))}
              />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
            <p className="form-hint">
              Schakel automatische Discord-kanaalcategorie aanmaak in. Gebruik de knop hieronder om kanalen daadwerkelijk aan te maken.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Categorieën per chat</label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={values.categoriePerChat ?? false}
                onChange={e => setValues(v => ({ ...v, categoriePerChat: e.target.checked }))}
              />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
            <p className="form-hint">
              Wanneer ingeschakeld worden vragen gefilterd op de categorie gekoppeld aan het Discord-kanaal. Zonder koppeling worden alle vragen getoond.
            </p>
          </div>

          <button type="submit" className="btn btn-primary">💾 Opslaan</button>
        </form>
      </div>

      {/* Categoriemappen aanmaken */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>📁 Categoriemappen aanmaken</h2>
        <p className="form-hint" style={{ marginBottom: '12px' }}>
          Maakt automatisch een Discord-kanaalcategorie "🎮 Waarheid of Doen" aan met een tekstkanaal per vraagcategorie. De kanalen worden direct gekoppeld.
        </p>
        <button
          className="btn btn-primary"
          onClick={maakCategorieMappen}
          disabled={aanmaakBezig}
        >
          {aanmaakBezig ? '⏳ Bezig...' : '🗂️ Maak categoriemappen aan'}
        </button>
      </div>

      {/* Channel-categorie mapping */}
      {values.categoriePerChat && (
        <div className="card" style={{ marginTop: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>🔗 Kanaal-categorie koppeling</h2>
          <p className="form-hint" style={{ marginBottom: '16px' }}>
            Koppel Discord-kanalen aan vraagcategorieën. In een gekoppeld kanaal worden alleen vragen uit die categorie getoond.
          </p>

          {mappings.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Kanaal</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Categorie</th>
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
                <option value="">— Kies kanaal —</option>
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
                ➕ Koppelen
              </button>
            </div>
          ) : (
            categorieen.length === 0
              ? <p className="form-hint">Geen vraagcategorieën gevonden. Voeg eerst vragen toe.</p>
              : <p className="form-hint">Alle kanalen zijn al gekoppeld.</p>
          )}
        </div>
      )}

      {/* Reset configuratie */}
      <div className="card" style={{ marginTop: '24px', borderColor: 'var(--danger, #ed4245)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>🔄 Configuratie resetten</h2>
        <p className="form-hint" style={{ marginBottom: '12px' }}>
          Zet alle instellingen terug naar standaardwaarden en verwijder alle kanaal-categorie koppelingen voor deze server.
        </p>
        {!bevestigReset ? (
          <button className="btn btn-danger" onClick={() => setBevestigReset(true)}>
            ⚠️ Reset naar standaard
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px' }}>Weet je het zeker?</span>
            <button className="btn btn-danger" onClick={resetConfig} disabled={resetBezig}>
              {resetBezig ? '⏳ Bezig...' : '✔️ Ja, reset alles'}
            </button>
            <button className="btn" onClick={() => setBevestigReset(false)}>Annuleer</button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

const CATEGORIEEN = ['algemeen', 'vrienden', 'koppels', 'feest', '18+'];

const CAT_KLEUREN = {
  algemeen: '#5865f2',
  vrienden: '#57f287',
  koppels: '#eb459e',
  feest: '#fee75c',
  '18+': '#ed4245',
};

function catKleur(cat) {
  return CAT_KLEUREN[cat] || '#99aab5';
}

function Feedback({ feedback }) {
  if (!feedback) return null;
  return (
    <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
      {feedback.msg}
    </div>
  );
}

export default function Vragen() {
  const { t } = useLanguage();
  const [tab, setTab] = useState('waarheid');
  const [vragen, setVragen] = useState({ waarheid: [], doen: [] });
  const [nieuwTekst, setNieuwTekst] = useState('');
  const [nieuwCat, setNieuwCat] = useState('algemeen');
  const [nieuwDM, setNieuwDM] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editTekst, setEditTekst] = useState('');
  const [editCat, setEditCat] = useState('algemeen');
  const [editDM, setEditDM] = useState(false);
  const [catFilter, setCatFilter] = useState('alle');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const importRef = useRef();

  const toon = (msg, type = 'success') => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const laad = useCallback(async () => {
    try {
      setVragen(await api.getVragen());
    } catch {
      toon(t('vragen.opslaanMislukt'), 'error');
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { laad(); }, [laad]);

  const toevoegen = async (e) => {
    e.preventDefault();
    if (!nieuwTekst.trim()) return;
    try {
      await api.addVraag(tab, nieuwTekst.trim(), nieuwCat, nieuwDM);
      setNieuwTekst('');
      setNieuwDM(false);
      await laad();
      toon(t('vragen.toegevoegd'));
    } catch {
      toon(t('vragen.toevoegenMislukt'), 'error');
    }
  };

  const toggleDM = async (item) => {
    try {
      await api.updateVraag(item.id, item.tekst, item.categorie, !item.dmModus);
      await laad();
    } catch {
      toon(t('vragen.dmWijzigenMislukt'), 'error');
    }
  };

  const opslaan = async (id) => {
    if (!editTekst.trim()) return;
    try {
      await api.updateVraag(id, editTekst.trim(), editCat, editDM);
      setEditId(null);
      await laad();
      toon(t('vragen.bijgewerkt'));
    } catch {
      toon(t('vragen.opslaanMislukt'), 'error');
    }
  };

  const verwijder = async (id) => {
    if (!confirm(t('vragen.verwijderConfirm'))) return;
    try {
      await api.deleteVraag(id);
      await laad();
      toon(t('vragen.verwijderd'));
    } catch {
      toon(t('vragen.verwijderenMislukt'), 'error');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const result = await api.importVragen(text);
      await laad();
      const msg = result.overgeslagen > 0
        ? `✅ ${result.toegevoegd} vragen toegevoegd, ${result.overgeslagen} overgeslagen (duplicaat).`
        : `✅ ${result.toegevoegd} vragen toegevoegd.`;
      toon(msg);
    } catch {
      toon(t('vragen.importMislukt'), 'error');
    }
    e.target.value = '';
  };

  const huidigeVragen = vragen[tab];
  const metIndex = huidigeVragen.map((v, i) => ({ ...v, displayNum: i + 1 }));
  const distinctCats = new Set(huidigeVragen.map(v => v.categorie));
  const gefilterd = catFilter === 'alle' ? metIndex : metIndex.filter(v => v.categorie === catFilter);
  const filterOpties = ['alle', ...distinctCats];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('vragen.title')}</h1>
      </div>

      <Feedback feedback={feedback} />

      <div className="tabs">
        <button
          className={`tab ${tab === 'waarheid' ? 'active' : ''}`}
          onClick={() => { setTab('waarheid'); setEditId(null); setCatFilter('alle'); }}
        >
          {t('vragen.tabWaarheid', { count: vragen.waarheid.length })}
        </button>
        <button
          className={`tab ${tab === 'doen' ? 'active' : ''}`}
          onClick={() => { setTab('doen'); setEditId(null); setCatFilter('alle'); }}
        >
          {t('vragen.tabDoen', { count: vragen.doen.length })}
        </button>
      </div>

      <form className="add-form" onSubmit={toevoegen}>
        <input
          className="form-input"
          placeholder={tab === 'waarheid' ? t('vragen.placeholderWaarheid') : t('vragen.placeholderDoen')}
          value={nieuwTekst}
          onChange={e => setNieuwTekst(e.target.value)}
        />
        <select
          className="form-select"
          value={nieuwCat}
          onChange={e => setNieuwCat(e.target.value)}
        >
          {CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          type="button"
          className={`btn btn-icon ${nieuwDM ? 'btn-primary' : 'btn-ghost'}`}
          title={nieuwDM ? t('vragen.dmAan') : t('vragen.dmUit')}
          onClick={() => setNieuwDM(v => !v)}
        >📩</button>
        <button type="submit" className="btn btn-primary">{t('vragen.toevoegen')}</button>
      </form>

      {distinctCats.size > 1 && (
        <div className="cat-filter">
          {filterOpties.map(c => (
            <button
              key={c}
              className={`cat-pill ${catFilter === c ? 'active' : ''}`}
              onClick={() => setCatFilter(c)}
              style={catFilter === c && c !== 'alle'
                ? { backgroundColor: catKleur(c), color: '#fff', borderColor: catKleur(c) }
                : {}}
            >
              {c === 'alle' ? t('vragen.alle') : c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="muted">{t('laden')}</p>
      ) : gefilterd.length === 0 ? (
        <p className="muted">
          {tab === 'waarheid' ? t('vragen.geenWaarheid') : t('vragen.geenDoen')}
          {catFilter !== 'alle' ? t('vragen.inCategorie', { cat: catFilter }) : ''}
        </p>
      ) : (
        <div className="question-list">
          {gefilterd.map((item) => (
            <div key={item.id} className={`question-item ${editId === item.id ? 'editing' : ''}`}>
              <span className="question-num">#{item.displayNum}</span>
              {editId === item.id ? (
                <>
                  <input
                    className="form-input"
                    value={editTekst}
                    onChange={e => setEditTekst(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') opslaan(item.id);
                      if (e.key === 'Escape') setEditId(null);
                    }}
                    autoFocus
                  />
                  <select
                    className="form-select form-select-sm"
                    value={editCat}
                    onChange={e => setEditCat(e.target.value)}
                  >
                    {CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    type="button"
                    className={`btn btn-icon ${editDM ? 'btn-primary' : 'btn-ghost'}`}
                    title={editDM ? t('vragen.dmAan') : t('vragen.dmUit')}
                    onClick={() => setEditDM(v => !v)}
                  >📩</button>
                  <div className="question-actions">
                    <button className="btn btn-primary btn-icon" onClick={() => opslaan(item.id)}>✓</button>
                    <button className="btn btn-ghost btn-icon" onClick={() => setEditId(null)}>✕</button>
                  </div>
                </>
              ) : (
                <>
                  <span className="question-text">{item.tekst}</span>
                  <span
                    className="cat-badge"
                    style={{
                      backgroundColor: catKleur(item.categorie) + '22',
                      color: catKleur(item.categorie),
                      borderColor: catKleur(item.categorie) + '55',
                    }}
                  >
                    {item.categorie}
                  </span>
                  <div className="question-actions">
                    <button
                      className={`btn btn-icon ${item.dmModus ? 'btn-primary' : 'btn-ghost'}`}
                      title={item.dmModus ? t('vragen.dmAanKlik') : t('vragen.dmUitKlik')}
                      onClick={() => toggleDM(item)}
                    >📩</button>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => { setEditId(item.id); setEditTekst(item.tekst); setEditCat(item.categorie); setEditDM(item.dmModus); }}
                    >✏️</button>
                    <button className="btn btn-danger btn-icon" onClick={() => verwijder(item.id)}>🗑️</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '14px' }}>{t('vragen.importExport')}</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a href="/api/vragen/export" className="btn btn-ghost">{t('vragen.exporteren')}</a>
          <button className="btn btn-ghost" onClick={() => importRef.current?.click()}>{t('vragen.importeren')}</button>
          <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
        </div>
        <p className="form-hint" style={{ marginTop: '8px' }}>
          {t('vragen.csvHint')}
        </p>
      </div>
    </div>
  );
}

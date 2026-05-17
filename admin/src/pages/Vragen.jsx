import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api.js';

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
  const [tab, setTab] = useState('waarheid');
  const [vragen, setVragen] = useState({ waarheid: [], doen: [] });
  const [nieuwTekst, setNieuwTekst] = useState('');
  const [nieuwCat, setNieuwCat] = useState('algemeen');
  const [nieuwDM, setNieuwDM] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
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
      toon('Laden mislukt.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { laad(); }, [laad]);

  const toevoegen = async (e) => {
    e.preventDefault();
    if (!nieuwTekst.trim()) return;
    try {
      await api.addVraag(tab, nieuwTekst.trim(), nieuwCat, nieuwDM);
      setNieuwTekst('');
      setNieuwDM(false);
      await laad();
      toon('Vraag toegevoegd!');
    } catch {
      toon('Toevoegen mislukt.', 'error');
    }
  };

  const toggleDM = async (originalIdx, huidig) => {
    const item = huidigeVragen[originalIdx];
    try {
      await api.updateVraag(tab, originalIdx, item.tekst, item.categorie, !huidig);
      await laad();
    } catch {
      toon('DM-modus wijzigen mislukt.', 'error');
    }
  };

  const opslaan = async (originalIdx) => {
    if (!editTekst.trim()) return;
    try {
      await api.updateVraag(tab, originalIdx, editTekst.trim(), editCat, editDM);
      setEditIdx(null);
      await laad();
      toon('Vraag bijgewerkt!');
    } catch {
      toon('Opslaan mislukt.', 'error');
    }
  };

  const verwijder = async (originalIdx) => {
    if (!confirm('Weet je zeker dat je deze vraag wilt verwijderen?')) return;
    try {
      await api.deleteVraag(tab, originalIdx);
      await laad();
      toon('Vraag verwijderd.');
    } catch {
      toon('Verwijderen mislukt.', 'error');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const result = await api.importVragen(text);
      await laad();
      toon(`${result.toegevoegd} vragen geïmporteerd!`);
    } catch {
      toon('Importeren mislukt. Controleer het CSV-formaat.', 'error');
    }
    e.target.value = '';
  };

  const huidigeVragen = vragen[tab];
  const metIndex = huidigeVragen.map((v, i) => ({ ...v, originalIdx: i }));
  const distinctCats = new Set(huidigeVragen.map(v => v.categorie));
  const gefilterd = catFilter === 'alle' ? metIndex : metIndex.filter(v => v.categorie === catFilter);
  const filterOpties = ['alle', ...distinctCats];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📝 Vragen beheren</h1>
      </div>

      <Feedback feedback={feedback} />

      <div className="tabs">
        <button
          className={`tab ${tab === 'waarheid' ? 'active' : ''}`}
          onClick={() => { setTab('waarheid'); setEditIdx(null); setCatFilter('alle'); }}
        >
          🔵 Waarheid ({vragen.waarheid.length})
        </button>
        <button
          className={`tab ${tab === 'doen' ? 'active' : ''}`}
          onClick={() => { setTab('doen'); setEditIdx(null); setCatFilter('alle'); }}
        >
          🔴 Doen ({vragen.doen.length})
        </button>
      </div>

      <form className="add-form" onSubmit={toevoegen}>
        <input
          className="form-input"
          placeholder={tab === 'waarheid' ? 'Nieuwe waarheidsvraag...' : 'Nieuwe doe-opdracht...'}
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
          title={nieuwDM ? 'DM-modus aan' : 'DM-modus uit'}
          onClick={() => setNieuwDM(v => !v)}
        >📩</button>
        <button type="submit" className="btn btn-primary">Toevoegen</button>
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
              {c === 'alle' ? 'Alle' : c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="muted">Laden...</p>
      ) : gefilterd.length === 0 ? (
        <p className="muted">
          Geen {tab === 'waarheid' ? 'waarheidsvragen' : 'doe-opdrachten'}
          {catFilter !== 'alle' ? ` in categorie "${catFilter}"` : ''}.
        </p>
      ) : (
        <div className="question-list">
          {gefilterd.map((item) => (
            <div key={item.originalIdx} className={`question-item ${editIdx === item.originalIdx ? 'editing' : ''}`}>
              <span className="question-num">#{item.originalIdx + 1}</span>
              {editIdx === item.originalIdx ? (
                <>
                  <input
                    className="form-input"
                    value={editTekst}
                    onChange={e => setEditTekst(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') opslaan(item.originalIdx);
                      if (e.key === 'Escape') setEditIdx(null);
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
                    title={editDM ? 'DM-modus aan' : 'DM-modus uit'}
                    onClick={() => setEditDM(v => !v)}
                  >📩</button>
                  <div className="question-actions">
                    <button className="btn btn-primary btn-icon" onClick={() => opslaan(item.originalIdx)}>✓</button>
                    <button className="btn btn-ghost btn-icon" onClick={() => setEditIdx(null)}>✕</button>
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
                      title={item.dmModus ? 'DM-modus aan – klik om uit te zetten' : 'DM-modus uit – klik om aan te zetten'}
                      onClick={() => toggleDM(item.originalIdx, item.dmModus)}
                    >📩</button>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => { setEditIdx(item.originalIdx); setEditTekst(item.tekst); setEditCat(item.categorie); setEditDM(item.dmModus); }}
                    >✏️</button>
                    <button className="btn btn-danger btn-icon" onClick={() => verwijder(item.originalIdx)}>🗑️</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '14px' }}>📂 Import / Export</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a href="/api/vragen/export" className="btn btn-ghost">⬇️ Exporteren (CSV)</a>
          <button className="btn btn-ghost" onClick={() => importRef.current?.click()}>⬆️ Importeren (CSV)</button>
          <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
        </div>
        <p className="form-hint" style={{ marginTop: '8px' }}>
          CSV-formaat: kolommen <code>type</code>, <code>tekst</code>, <code>categorie</code>. Exporteer eerst voor een voorbeeld.
        </p>
      </div>
    </div>
  );
}

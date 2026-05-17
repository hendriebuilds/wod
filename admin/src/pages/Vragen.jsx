import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

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
  const [nieuw, setNieuw] = useState('');
  const [editIdx, setEditIdx] = useState(null);
  const [editTekst, setEditTekst] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);

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
    if (!nieuw.trim()) return;
    try {
      await api.addVraag(tab, nieuw.trim());
      setNieuw('');
      await laad();
      toon('Vraag toegevoegd!');
    } catch {
      toon('Toevoegen mislukt.', 'error');
    }
  };

  const opslaan = async (idx) => {
    if (!editTekst.trim()) return;
    try {
      await api.updateVraag(tab, idx, editTekst.trim());
      setEditIdx(null);
      await laad();
      toon('Vraag bijgewerkt!');
    } catch {
      toon('Opslaan mislukt.', 'error');
    }
  };

  const verwijder = async (idx) => {
    if (!confirm('Weet je zeker dat je deze vraag wilt verwijderen?')) return;
    try {
      await api.deleteVraag(tab, idx);
      await laad();
      toon('Vraag verwijderd.');
    } catch {
      toon('Verwijderen mislukt.', 'error');
    }
  };

  const huidigeVragen = vragen[tab];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📝 Vragen beheren</h1>
      </div>

      <Feedback feedback={feedback} />

      <div className="tabs">
        <button
          className={`tab ${tab === 'waarheid' ? 'active' : ''}`}
          onClick={() => { setTab('waarheid'); setEditIdx(null); }}
        >
          🔵 Waarheid ({vragen.waarheid.length})
        </button>
        <button
          className={`tab ${tab === 'doen' ? 'active' : ''}`}
          onClick={() => { setTab('doen'); setEditIdx(null); }}
        >
          🔴 Doen ({vragen.doen.length})
        </button>
      </div>

      <form className="add-form" onSubmit={toevoegen}>
        <input
          className="form-input"
          placeholder={tab === 'waarheid' ? 'Nieuwe waarheidsvraag...' : 'Nieuwe doe-opdracht...'}
          value={nieuw}
          onChange={e => setNieuw(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">Toevoegen</button>
      </form>

      {loading ? (
        <p className="muted">Laden...</p>
      ) : huidigeVragen.length === 0 ? (
        <p className="muted">Nog geen {tab === 'waarheid' ? 'waarheidsvragen' : 'doe-opdrachten'}.</p>
      ) : (
        <div className="question-list">
          {huidigeVragen.map((tekst, i) => (
            <div key={i} className={`question-item ${editIdx === i ? 'editing' : ''}`}>
              <span className="question-num">#{i + 1}</span>
              {editIdx === i ? (
                <>
                  <input
                    className="form-input"
                    value={editTekst}
                    onChange={e => setEditTekst(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') opslaan(i);
                      if (e.key === 'Escape') setEditIdx(null);
                    }}
                    autoFocus
                  />
                  <div className="question-actions">
                    <button className="btn btn-primary btn-icon" onClick={() => opslaan(i)}>✓</button>
                    <button className="btn btn-ghost btn-icon" onClick={() => setEditIdx(null)}>✕</button>
                  </div>
                </>
              ) : (
                <>
                  <span className="question-text">{tekst}</span>
                  <div className="question-actions">
                    <button className="btn btn-ghost btn-icon" onClick={() => { setEditIdx(i); setEditTekst(tekst); }}>✏️</button>
                    <button className="btn btn-danger btn-icon" onClick={() => verwijder(i)}>🗑️</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

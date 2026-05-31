import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

function Feedback({ feedback }) {
  if (!feedback) return null;
  return (
    <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
      {feedback.msg}
    </div>
  );
}

export default function Nooit() {
  const { t } = useLanguage();
  const [stellingen, setStelling] = useState([]);
  const [nieuwTekst, setNieuwTekst] = useState('');
  const [editId, setEditId] = useState(null);
  const [editTekst, setEditTekst] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);

  const toon = (msg, type = 'success') => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const laad = useCallback(async () => {
    try {
      setStelling(await api.getNooit());
    } catch {
      toon(t('nooit.ladenMislukt'), 'error');
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { laad(); }, [laad]);

  const toevoegen = async (e) => {
    e.preventDefault();
    if (!nieuwTekst.trim()) return;
    try {
      await api.addNooit(nieuwTekst.trim());
      setNieuwTekst('');
      await laad();
      toon(t('nooit.toegevoegd'));
    } catch {
      toon(t('nooit.toevoegenMislukt'), 'error');
    }
  };

  const opslaan = async (id) => {
    if (!editTekst.trim()) return;
    try {
      await api.updateNooit(id, editTekst.trim());
      setEditId(null);
      await laad();
      toon(t('nooit.bijgewerkt'));
    } catch {
      toon(t('nooit.opslaanMislukt'), 'error');
    }
  };

  const verwijder = async (id) => {
    if (!confirm(t('nooit.verwijderConfirm'))) return;
    try {
      await api.deleteNooit(id);
      await laad();
      toon(t('nooit.verwijderd'));
    } catch {
      toon(t('nooit.verwijderenMislukt'), 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('nooit.title')}</h1>
      </div>

      <Feedback feedback={feedback} />

      <form className="add-form" onSubmit={toevoegen}>
        <input
          className="form-input"
          placeholder={t('nooit.placeholder')}
          value={nieuwTekst}
          onChange={e => setNieuwTekst(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">{t('nooit.toevoegen')}</button>
      </form>

      {loading ? (
        <p className="muted">{t('laden')}</p>
      ) : stellingen.length === 0 ? (
        <p className="muted">{t('nooit.geenStellingen')}</p>
      ) : (
        <div className="question-list">
          {stellingen.map((item, i) => (
            <div key={item.id} className={`question-item ${editId === item.id ? 'editing' : ''}`}>
              <span className="question-num">#{i + 1}</span>
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
                  <div className="question-actions">
                    <button className="btn btn-primary btn-icon" onClick={() => opslaan(item.id)}>✓</button>
                    <button className="btn btn-ghost btn-icon" onClick={() => setEditId(null)}>✕</button>
                  </div>
                </>
              ) : (
                <>
                  <span className="question-text">{item.tekst}</span>
                  <div className="question-actions">
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => { setEditId(item.id); setEditTekst(item.tekst); }}
                    >✏️</button>
                    <button className="btn btn-danger btn-icon" onClick={() => verwijder(item.id)}>🗑️</button>
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

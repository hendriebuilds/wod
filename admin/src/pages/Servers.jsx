import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';

export default function Servers() {
  const { t, strings } = useLanguage();
  const [servers, setServers] = useState([]);
  const [filter, setFilter] = useState('alle');
  const [zoek, setZoek] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [verlatenId, setVerlatenId] = useState(null);
  const [bezig, setBezig] = useState(null);

  const toon = (msg, type = 'success') => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const laad = useCallback(async () => {
    try {
      setServers(await api.getServers());
    } catch {
      toon(t('servers.ladenMislukt'), 'error');
    }
  }, [t]);

  useEffect(() => {
    laad();
  }, [laad]);

  const beheer = async (guildId) => {
    try {
      await api.setActiveGuild(guildId);
      window.location.reload();
    } catch {
      toon(t('servers.wisselnMislukt'), 'error');
    }
  };

  const verlaten = async (guildId) => {
    setBezig(guildId);
    try {
      await api.leaveServer(guildId);
      toon(t('servers.verlatenSuccess'));
      setVerlatenId(null);
      await laad();
    } catch (err) {
      toon(t('servers.verlatenMislukt', { error: err.message || t('onbekendeFout') }), 'error');
    } finally {
      setBezig(null);
    }
  };

  const iconUrl = (s) =>
    s.icon
      ? `https://cdn.discordapp.com/icons/${s.guild_id}/${s.icon}.png?size=32`
      : null;

  const formatDatum = (ts) => {
    try {
      return new Date(ts * 1000).toLocaleDateString(strings.locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
  };

  const gefilterd = servers
    .filter(s => filter === 'alle' || (filter === 'online' ? s.online : !s.online))
    .filter(s => !zoek || s.naam.toLowerCase().includes(zoek.toLowerCase()) || s.guild_id.includes(zoek));

  const totalen = {
    vragen: servers.reduce((sum, s) => sum + s.vragen_waarheid + s.vragen_doen, 0),
    sessies: servers.reduce((sum, s) => sum + s.sessies_actief, 0),
    leden: servers.reduce((sum, s) => sum + (s.member_count || 0), 0),
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('servers.title')}</h1>
        <div className="action-row">
          <button className="btn btn-ghost" onClick={laad}>{t('servers.vernieuwen')}</button>
        </div>
      </div>

      {feedback && (
        <div className={feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {feedback.msg}
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div className="stat-value">{servers.length}</div>
          <div className="stat-label">{t('servers.totaal')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#57f287' }}>
            {servers.filter(s => s.online).length}
          </div>
          <div className="stat-label">{t('servers.online')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalen.leden.toLocaleString(strings.locale)}</div>
          <div className="stat-label">{t('servers.ledenTotaal')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalen.vragen}</div>
          <div className="stat-label">{t('servers.vragenTotaal')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#fee75c' }}>{totalen.sessies}</div>
          <div className="stat-label">{t('servers.activeSessies')}</div>
        </div>
      </div>

      <div className="action-row" style={{ marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
        {[['alle', t('servers.alle')], ['online', '🟢 Online'], ['offline', '🔴 Offline']].map(([key, label]) => (
          <button
            key={key}
            className={`btn ${filter === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(key)}
          >
            {label}
            <span style={{ marginLeft: '6px', opacity: 0.7 }}>
              ({key === 'alle' ? servers.length : servers.filter(s => key === 'online' ? s.online : !s.online).length})
            </span>
          </button>
        ))}
        <input
          type="text"
          className="form-input"
          placeholder={t('servers.zoek')}
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          style={{ maxWidth: '220px', marginLeft: 'auto' }}
        />
      </div>

      {gefilterd.length === 0 ? (
        <p className="muted">{t('servers.geenServers')}</p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2, #2b2d31)', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('servers.colServer')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('servers.colLeden')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('servers.colVragen')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('servers.colSessies')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('servers.colToegevoegd')}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{t('servers.colActies')}</th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.map((s, i) => (
                <tr
                  key={s.guild_id}
                  style={{
                    borderTop: i > 0 ? '1px solid var(--border, #3f4147)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {iconUrl(s)
                        ? <img src={iconUrl(s)} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                        : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-2,#2b2d31)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🎮</div>
                      }
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {s.naam}
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: s.online ? '#57f287' : '#ed4245',
                            display: 'inline-block', flexShrink: 0,
                          }} />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted,#888)', fontFamily: 'monospace' }}>
                          {s.guild_id}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: '10px 14px', fontSize: '13px' }}>
                    {s.member_count > 0 ? s.member_count.toLocaleString(strings.locale) : '—'}
                  </td>

                  <td style={{ padding: '10px 14px', fontSize: '13px' }}>
                    <span style={{ color: '#5865f2' }}>{s.vragen_waarheid}W</span>
                    {' / '}
                    <span style={{ color: '#ed4245' }}>{s.vragen_doen}D</span>
                  </td>

                  <td style={{ padding: '10px 14px', fontSize: '13px' }}>
                    {s.sessies_actief > 0
                      ? <span style={{ color: '#fee75c', fontWeight: 600 }}>{s.sessies_actief} {t('servers.actief')}</span>
                      : <span style={{ color: 'var(--muted,#888)' }}>—</span>
                    }
                  </td>

                  <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--muted,#888)' }}>
                    {formatDatum(s.joined_at)}
                  </td>

                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {s.online && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                          onClick={() => beheer(s.guild_id)}
                        >
                          {t('servers.beheren')}
                        </button>
                      )}

                      {verlatenId === s.guild_id ? (
                        <>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => verlaten(s.guild_id)}
                            disabled={bezig === s.guild_id}
                          >
                            {bezig === s.guild_id ? '...' : t('servers.verlatenJa')}
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => setVerlatenId(null)}
                          >
                            {t('servers.annuleer')}
                          </button>
                        </>
                      ) : (
                        s.online && (
                          <button
                            className="btn btn-danger"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => setVerlatenId(s.guild_id)}
                          >
                            {t('servers.verlaten')}
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ marginTop: '12px', fontSize: '12px' }}>
        {t('servers.superadminHint')}
      </p>
    </div>
  );
}

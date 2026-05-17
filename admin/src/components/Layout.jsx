import { useState, useEffect } from 'react';
import { api } from '../api.js';
import Vragen from '../pages/Vragen.jsx';
import Statistieken from '../pages/Statistieken.jsx';
import Instellingen from '../pages/Instellingen.jsx';
import Configuratie from '../pages/Configuratie.jsx';
import Nooit from '../pages/Nooit.jsx';

const PAGES = {
  vragen: { label: '📝 Vragen', component: Vragen },
  nooit: { label: '🍺 Nooit', component: Nooit },
  statistieken: { label: '📊 Statistieken', component: Statistieken },
  instellingen: { label: '⚙️ Instellingen', component: Instellingen },
  configuratie: { label: '🔧 Configuratie', component: Configuratie },
};

export default function Layout({ user, onLogout }) {
  const [page, setPage] = useState('vragen');
  const [guilds, setGuilds] = useState([]);
  const [activeGuildId, setActiveGuildId] = useState(null);
  const [pageKey, setPageKey] = useState(0);

  useEffect(() => {
    api.getGuilds().then(({ guilds, activeGuildId }) => {
      setGuilds(guilds);
      setActiveGuildId(activeGuildId);
    }).catch(() => {});
  }, []);

  const handleGuildChange = async (guildId) => {
    try {
      await api.setActiveGuild(guildId);
      setActiveGuildId(guildId);
      setPageKey(k => k + 1);
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    onLogout();
  };

  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  const PageComponent = PAGES[page].component;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-title">🎮 WoD Admin</div>

        {guilds.length > 1 && (
          <div className="guild-selector">
            <select
              value={activeGuildId || ''}
              onChange={e => handleGuildChange(e.target.value)}
              className="form-select"
              style={{ width: '100%', marginBottom: '12px' }}
            >
              {guilds.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {guilds.length === 1 && (
          <div className="guild-name">{guilds[0].name}</div>
        )}

        <nav>
          {Object.entries(PAGES).map(([key, { label }]) => (
            <button
              key={key}
              className={page === key ? 'active' : ''}
              onClick={() => setPage(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <img src={avatarUrl} alt="" />
            <span>{user.username}</span>
          </div>
          <button onClick={handleLogout} className="btn-logout">Uitloggen</button>
        </div>
      </aside>
      <main className="main">
        <PageComponent key={pageKey} />
      </main>
    </div>
  );
}

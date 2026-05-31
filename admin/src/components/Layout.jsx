import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useLanguage } from '../LanguageContext.jsx';
import Vragen from '../pages/Vragen.jsx';
import Statistieken from '../pages/Statistieken.jsx';
import Ranglijst from '../pages/Ranglijst.jsx';
import Instellingen from '../pages/Instellingen.jsx';
import Configuratie from '../pages/Configuratie.jsx';
import Nooit from '../pages/Nooit.jsx';
import Sessies from '../pages/Sessies.jsx';
import Servers from '../pages/Servers.jsx';

const PAGE_COMPONENTS = {
  vragen: Vragen,
  nooit: Nooit,
  sessies: Sessies,
  statistieken: Statistieken,
  ranglijst: Ranglijst,
  instellingen: Instellingen,
  configuratie: Configuratie,
  servers: Servers,
};

export default function Layout({ user, onLogout }) {
  const { t, toggle } = useLanguage();
  const [page, setPage] = useState('vragen');
  const [guilds, setGuilds] = useState([]);
  const [activeGuildId, setActiveGuildId] = useState(null);
  const [pageKey, setPageKey] = useState(0);

  const BASE_PAGES = ['vragen', 'nooit', 'sessies', 'statistieken', 'ranglijst', 'instellingen', 'configuratie'];
  const pages = user?.isSuperAdmin ? [...BASE_PAGES, 'servers'] : BASE_PAGES;

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

  const PageComponent = PAGE_COMPONENTS[page] ?? Vragen;

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
          {pages.map((key) => (
            <button
              key={key}
              className={page === key ? 'active' : ''}
              onClick={() => setPage(key)}
            >
              {t(`nav.${key}`)}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <img src={avatarUrl} alt="" />
            <span>{user.username}</span>
          </div>
          <button onClick={toggle} className="btn-lang">
            {t('nav.taalSwitch')}
          </button>
          <button onClick={handleLogout} className="btn-logout">{t('nav.uitloggen')}</button>
        </div>
      </aside>
      <main className="main">
        <PageComponent key={pageKey} />
      </main>
    </div>
  );
}

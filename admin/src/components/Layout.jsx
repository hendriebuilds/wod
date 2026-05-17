import { useState } from 'react';
import { api } from '../api.js';
import Vragen from '../pages/Vragen.jsx';
import Statistieken from '../pages/Statistieken.jsx';
import Instellingen from '../pages/Instellingen.jsx';
import Configuratie from '../pages/Configuratie.jsx';

const PAGES = {
  vragen: { label: '📝 Vragen', component: Vragen },
  statistieken: { label: '📊 Statistieken', component: Statistieken },
  instellingen: { label: '⚙️ Instellingen', component: Instellingen },
  configuratie: { label: '🔧 Configuratie', component: Configuratie },
};

export default function Layout({ user, onLogout }) {
  const [page, setPage] = useState('vragen');

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
        <PageComponent />
      </main>
    </div>
  );
}

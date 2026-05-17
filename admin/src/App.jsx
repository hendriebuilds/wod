import { useState, useEffect } from 'react';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = nog laden

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="loading">Laden...</div>;
  if (!user) return <Login />;
  return <Layout user={user} onLogout={() => setUser(null)} />;
}

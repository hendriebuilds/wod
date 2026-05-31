import { useState, useEffect } from 'react';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import { LanguageProvider, useLanguage } from './LanguageContext.jsx';

function AppInner() {
  const { t } = useLanguage();
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="loading">{t('laden')}</div>;
  if (!user) return <Login />;
  return <Layout user={user} onLogout={() => setUser(null)} />;
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}

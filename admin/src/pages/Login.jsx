import { useLanguage } from '../LanguageContext.jsx';

export default function Login() {
  const { t } = useLanguage();
  const error = new URLSearchParams(window.location.search).get('error');

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🎮 WoD Admin</h1>
        <p>{t('login.subtitle')}</p>
        {error === 'geen_toegang' && (
          <div className="feedback-error" style={{ marginBottom: '20px' }}>
            {t('login.error')}
          </div>
        )}
        <a href="/auth/login" className="btn btn-discord">
          {t('login.button')}
        </a>
      </div>
    </div>
  );
}

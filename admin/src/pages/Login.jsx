import { useLanguage } from '../LanguageContext.jsx';

const FOUT_SLEUTELS = {
  geen_toegang: 'login.error',
  ongeldige_login: 'login.errorState',
  login_mislukt: 'login.errorMislukt',
};

export default function Login() {
  const { t } = useLanguage();
  const error = new URLSearchParams(window.location.search).get('error');
  const foutSleutel = FOUT_SLEUTELS[error];

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🎮 WoD Admin</h1>
        <p>{t('login.subtitle')}</p>
        {foutSleutel && (
          <div className="feedback-error" style={{ marginBottom: '20px' }}>
            {t(foutSleutel)}
          </div>
        )}
        <a href="/auth/login" className="btn btn-discord">
          {t('login.button')}
        </a>
      </div>
    </div>
  );
}

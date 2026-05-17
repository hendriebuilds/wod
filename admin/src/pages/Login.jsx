export default function Login() {
  const error = new URLSearchParams(window.location.search).get('error');

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🎮 WoD Admin</h1>
        <p>Beheer de Waarheid of Doen bot</p>
        {error === 'geen_toegang' && (
          <div className="feedback-error" style={{ marginBottom: '20px' }}>
            Je hebt geen beheerdersrechten op deze server.
          </div>
        )}
        <a href="/auth/login" className="btn btn-discord">
          Inloggen met Discord
        </a>
      </div>
    </div>
  );
}

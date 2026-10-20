import { useState } from 'react';
import { api } from '../api.js';
import { useTheme } from '../theme.js';
import { Icon, WolfMark } from '../ui.jsx';
import { APK_URL, IN_APP } from '../Shell.jsx';

export default function Login({ onSignedIn }) {
  const [theme, toggle] = useTheme();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSignedIn(await api('/api/auth/login', { method: 'POST', body: form }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <button className="icon-btn login-theme" onClick={toggle} aria-label="Toggle theme">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <WolfMark size={44} />
          <div>
            <h1>Wolf</h1>
            <p className="muted">Run every business from one place.</p>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Username</span>
          <input className="input" autoComplete="username" autoFocus value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" autoComplete="current-password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </label>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {!IN_APP && (
          <a href={APK_URL} download="Wolf.apk" className="login-app">
            <Icon name="download" size={15} />Download the Android app
          </a>
        )}
      </form>
    </div>
  );
}

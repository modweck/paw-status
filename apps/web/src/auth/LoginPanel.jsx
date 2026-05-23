import { KeyRound, Mail } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from './AuthProvider.jsx';

export function LoginPanel({ compact = false, description = '', title = 'Sign in to book' }) {
  const { authError, authMessage, isConfigured, sendMagicLink, signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState('magic-link');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email || submitting) return;
    if (mode === 'password' && !password) return;

    setSubmitting(true);
    if (mode === 'password') {
      await signInWithPassword(email, password);
    } else {
      await sendMagicLink(email);
    }
    setSubmitting(false);
  }

  const isPasswordMode = mode === 'password';

  return (
    <form
      className={compact ? 'login-panel login-panel--compact' : 'login-panel'}
      onSubmit={handleSubmit}
    >
      <div className="login-panel__icon">
        {isPasswordMode ? <KeyRound size={18} /> : <Mail size={18} />}
      </div>
      <div>
        <h2>{title}</h2>
        <p>
          {description ||
            (isPasswordMode
              ? 'Use your email and password if you added one.'
              : 'Use an email magic link, or sign in with a password if you added one.')}
        </p>
      </div>
      <button
        className="login-panel__secondary"
        type="button"
        onClick={() => setMode(isPasswordMode ? 'magic-link' : 'password')}
      >
        {isPasswordMode ? 'Use magic link instead' : 'Use password instead'}
      </button>
      <label>
        <span>Email</span>
        <input
          aria-label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={!isConfigured || submitting}
          required
        />
      </label>
      {isPasswordMode ? (
        <label>
          <span>Password</span>
          <input
            aria-label="Password"
            autoComplete="current-password"
            disabled={!isConfigured || submitting}
            minLength="6"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
      ) : null}
      <button type="submit" disabled={!isConfigured || submitting}>
        {submitting
          ? isPasswordMode
            ? 'Signing in...'
            : 'Sending...'
          : isPasswordMode
            ? 'Sign in with password'
            : 'Send sign-in link'}
      </button>
      {!isConfigured ? (
        <p className="form-message form-message--error">Supabase public env is missing.</p>
      ) : null}
      {authError ? <p className="form-message form-message--error">{authError}</p> : null}
      {authMessage ? <p className="form-message">{authMessage}</p> : null}
    </form>
  );
}

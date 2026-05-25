import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { buildAuthRedirectUrl } from './authRedirect.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function sendMagicLink(email) {
    setAuthError('');
    setAuthMessage('');

    if (!supabase) {
      setAuthError('Supabase is not configured for this environment.');
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildAuthRedirectUrl(window.location.origin),
      },
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage('Check your email for a ShinyPawz sign-in link.');
  }

  async function signInWithPassword(email, password) {
    setAuthError('');
    setAuthMessage('');

    if (!supabase) {
      setAuthError('Supabase is not configured for this environment.');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage('Signed in to your ShinyPawz account.');
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  }

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isConfigured: Boolean(supabase),
      authMessage,
      authError,
      sendMagicLink,
      signInWithPassword,
      signOut,
    }),
    [authError, authMessage, loading, session, supabase],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return value;
}

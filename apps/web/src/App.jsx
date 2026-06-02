import { useCallback, useEffect, useRef, useState } from 'react';

import { AdminVerificationPanel } from './admin/AdminVerificationPanel.jsx';
import { isAuthCallbackPath } from './auth/authRedirect.js';
import { useAuth } from './auth/AuthProvider.jsx';
import { CustomerApp } from './customer/CustomerApp.jsx';
import { StaffDashboard } from './groomer/StaffDashboard.jsx';
import { AppShell } from './layout/AppShell.jsx';
import {
  loadPreferredMode,
  MODE_CUSTOMER,
  MODE_GROOMER,
  savePreferredMode,
} from './layout/modePreference.js';

// Same-origin absolute path only: rejects empty, external, and
// protocol-relative ("//host") values that could redirect off-site or make
// history.replaceState throw a cross-origin SecurityError.
function isSafeNextPath(value) {
  return Boolean(value) && value.startsWith('/') && !value.startsWith('//');
}

function currentRoute(pathname = window.location.pathname) {
  if (pathname.startsWith('/admin')) {
    return 'admin';
  }

  if (pathname.startsWith('/groomer') || pathname.startsWith('/staff')) {
    return 'staff';
  }

  if (pathname.startsWith('/dogs')) return 'dogs';
  if (pathname.startsWith('/bookings')) return 'bookings';
  if (pathname.startsWith('/account')) return 'account';

  return 'customer';
}

export function App() {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState(() => currentRoute());
  // The persist effect stays dormant until the one-time restore has run, so it
  // can never overwrite the stored mode before restore reads it — including
  // when auth resolves asynchronously and re-triggers the effects.
  const didRestoreRef = useRef(false);

  useEffect(() => {
    function handleRouteChange() {
      setRoute(currentRoute());
    }

    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // After a magic-link redirect we land on /auth/callback?next=/groomer.
  // Restore the originating path so groomers return to their workspace
  // instead of falling through to the customer view.
  useEffect(() => {
    if (!isAuthCallbackPath(window.location.pathname)) return;
    const nextPath = new URLSearchParams(window.location.search).get('next');
    if (isSafeNextPath(nextPath)) {
      window.history.replaceState(null, '', nextPath);
      setRoute(currentRoute(nextPath));
    }
  }, []);

  const navigate = useCallback((href) => {
    window.history.pushState(null, '', href);
    setRoute(currentRoute(href));
  }, []);

  // Remember the mode the user is in so we can restore it next time. Entering
  // the groomer view any way (toggle or deep link) persists it; admin is left
  // untouched. Dormant until restore has run so it can't clobber the stored
  // mode first.
  useEffect(() => {
    if (!didRestoreRef.current) return;
    if (!user || route === 'admin') return;
    savePreferredMode(user, route === 'staff' ? MODE_GROOMER : MODE_CUSTOMER);
  }, [route, user]);

  // On a fresh bare-root load, send a returning groomer back to their last
  // mode. Deep links, ?step, and the magic-link ?next always win.
  useEffect(() => {
    if (loading || didRestoreRef.current) return;
    didRestoreRef.current = true;
    if (!user || window.location.pathname !== '/') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('next') || params.get('step')) return;
    if (loadPreferredMode(user) === MODE_GROOMER) {
      navigate('/groomer');
    }
  }, [user, loading, navigate]);

  return (
    <AppShell route={route} onNavigate={navigate}>
      {route === 'admin' ? (
        <AdminVerificationPanel />
      ) : route === 'staff' ? (
        <StaffDashboard />
      ) : (
        <CustomerApp initialSection={route} />
      )}
    </AppShell>
  );
}

export { currentRoute };

import { useCallback, useEffect, useState } from 'react';

import { AdminVerificationPanel } from './admin/AdminVerificationPanel.jsx';
import { isAuthCallbackPath } from './auth/authRedirect.js';
import { CustomerApp } from './customer/CustomerApp.jsx';
import { StaffDashboard } from './groomer/StaffDashboard.jsx';
import { AppShell } from './layout/AppShell.jsx';

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
  const [route, setRoute] = useState(() => currentRoute());

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

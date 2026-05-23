import { useCallback, useEffect, useState } from 'react';

import { AdminVerificationPanel } from './admin/AdminVerificationPanel.jsx';
import { CustomerApp } from './customer/CustomerApp.jsx';
import { StaffDashboard } from './groomer/StaffDashboard.jsx';
import { AppShell } from './layout/AppShell.jsx';

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

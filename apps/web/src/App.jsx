import { useCallback, useEffect, useState } from 'react';

import { AdminVerificationPanel } from './admin/AdminVerificationPanel.jsx';
import { CustomerApp } from './customer/CustomerApp.jsx';
import { StaffDashboard } from './groomer/StaffDashboard.jsx';
import { AppShell } from './layout/AppShell.jsx';

const STAFF_SECTIONS = ['requests', 'waitlist', 'setup'];

function staffSection(pathname, prefix) {
  const segment = pathname.slice(prefix.length).split('/').filter(Boolean)[0] || '';
  return STAFF_SECTIONS.includes(segment) ? segment : 'requests';
}

function currentRoute(pathname = window.location.pathname) {
  if (pathname.startsWith('/admin')) {
    return { persona: 'admin', section: 'verification' };
  }

  if (pathname.startsWith('/groomer')) {
    return { persona: 'staff', section: staffSection(pathname, '/groomer') };
  }

  if (pathname.startsWith('/staff')) {
    return { persona: 'staff', section: staffSection(pathname, '/staff') };
  }

  if (pathname.startsWith('/dogs')) return { persona: 'customer', section: 'dogs' };
  if (pathname.startsWith('/bookings')) return { persona: 'customer', section: 'bookings' };
  if (pathname.startsWith('/account')) return { persona: 'customer', section: 'account' };

  return { persona: 'customer', section: 'explore' };
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
      {route.persona === 'admin' ? (
        <AdminVerificationPanel />
      ) : route.persona === 'staff' ? (
        <StaffDashboard section={route.section} />
      ) : (
        <CustomerApp onNavigate={navigate} section={route.section} />
      )}
    </AppShell>
  );
}

export { currentRoute };

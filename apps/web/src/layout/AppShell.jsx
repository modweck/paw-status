import { CalendarDays, PawPrint, Scissors, ShieldCheck, UserRound } from 'lucide-react';

import { useAuth } from '../auth/AuthProvider.jsx';

const navItems = [
  { id: 'customer', label: 'Explore', icon: Scissors, href: '/' },
  { id: 'dogs', label: 'My Dog', icon: PawPrint, href: '/dogs' },
  { id: 'bookings', label: 'Bookings', icon: CalendarDays, href: '/bookings' },
  { id: 'account', label: 'Account', icon: UserRound, href: '/account' },
  { id: 'staff', label: 'Groomer', icon: ShieldCheck, href: '/groomer' },
];

export function AppShell({ route, children, onNavigate }) {
  const { user, signOut } = useAuth();

  function handleNavClick(event, href) {
    if (!href.startsWith('/')) return;

    event.preventDefault();
    onNavigate?.(href);
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="brand" href="/">
          <span>Shiny</span>Pawz
        </a>
        <div className="topbar__session">
          {user ? (
            <>
              <span>{user.email}</span>
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <span>Public</span>
          )}
        </div>
      </header>
      <main>{children}</main>
      <nav className="bottom-nav" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = route === item.id || (route === 'customer' && item.id === 'customer');
          const locked = !user && (item.id === 'dogs' || item.id === 'account');
          const href = locked ? '/bookings' : item.href;
          const className = [
            'bottom-nav__item',
            active ? 'is-active' : '',
            locked ? 'is-locked' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <a
              key={item.id}
              aria-disabled={locked ? 'true' : undefined}
              className={className}
              href={href}
              onClick={(event) => handleNavClick(event, href)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}

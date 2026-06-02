import { CalendarDays, PawPrint, Scissors, UserRound } from 'lucide-react';

import { useAuth } from '../auth/AuthProvider.jsx';
import { RoleToggle } from './RoleToggle.jsx';
import { MODE_CUSTOMER, MODE_GROOMER } from './modePreference.js';

const navItems = [
  { id: 'customer', label: 'Explore', icon: Scissors, href: '/' },
  { id: 'dogs', label: 'My Dog', icon: PawPrint, href: '/dogs' },
  { id: 'bookings', label: 'Bookings', icon: CalendarDays, href: '/bookings' },
  { id: 'account', label: 'Account', icon: UserRound, href: '/account' },
];

export function AppShell({ route, children, onNavigate }) {
  const { user, signOut } = useAuth();
  const mode = route === 'staff' ? MODE_GROOMER : MODE_CUSTOMER;

  function handleNavClick(event, href) {
    if (!href.startsWith('/')) return;

    event.preventDefault();
    onNavigate?.(href);
  }

  function handleSwitchMode(nextMode) {
    onNavigate?.(nextMode === MODE_GROOMER ? '/groomer' : '/');
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="brand" href="/">
          <span>Shiny</span>Pawz
        </a>
        {user ? <RoleToggle mode={mode} onSwitch={handleSwitchMode} /> : null}
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

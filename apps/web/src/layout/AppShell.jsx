import {
  CalendarDays,
  ClipboardList,
  PawPrint,
  Scissors,
  Settings2,
  Timer,
  UserRound,
} from 'lucide-react';

import { useAuth } from '../auth/AuthProvider.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { requireSupabaseClient } from '../lib/supabaseClient.js';

const CUSTOMER_NAV_ITEMS = [
  { section: 'explore', label: 'Explore', icon: Scissors, href: '/' },
  { section: 'dogs', label: 'My Dog', icon: PawPrint, href: '/dogs' },
  { section: 'bookings', label: 'Bookings', icon: CalendarDays, href: '/bookings' },
  { section: 'account', label: 'Account', icon: UserRound, href: '/account' },
];

const STAFF_NAV_ITEMS = [
  { section: 'requests', label: 'Requests', icon: ClipboardList, href: '/groomer' },
  { section: 'waitlist', label: 'Waitlist', icon: Timer, href: '/groomer/waitlist' },
  { section: 'setup', label: 'Setup', icon: Settings2, href: '/groomer/setup' },
];

const WORKSPACE_BADGES = {
  staff: 'Groomer workspace',
  admin: 'Admin',
};

function navItemsForPersona(persona) {
  if (persona === 'staff') return STAFF_NAV_ITEMS;
  if (persona === 'admin') return [];
  return CUSTOMER_NAV_ITEMS;
}

export function AppShell({ route, children, onNavigate }) {
  const { user, signOut } = useAuth();
  const persona = route?.persona || 'customer';
  const section = route?.section || '';
  const navItems = navItemsForPersona(persona);
  const workspaceBadge = WORKSPACE_BADGES[persona];

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
        {workspaceBadge ? <span className="topbar__workspace">{workspaceBadge}</span> : null}
        <div className="topbar__session">
          {user ? (
            <>
              <NotificationBell supabase={requireSupabaseClient()} />
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
      {navItems.length ? (
        <nav className="bottom-nav" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.section;
            const locked =
              persona === 'customer' &&
              !user &&
              (item.section === 'dogs' || item.section === 'account');
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
                key={item.section}
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
      ) : null}
    </div>
  );
}

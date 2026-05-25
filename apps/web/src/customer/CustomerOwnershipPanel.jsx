import { CalendarPlus, Heart, KeyRound, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  createCustomerForVerifiedUser,
  loadCustomerForVerifiedUser,
  updateCustomerForVerifiedUser,
} from '../api/customers.js';
import { requireSupabaseClient } from '../lib/supabaseClient.js';
import { BookingRequestPanel } from './BookingRequestPanel.jsx';
import { BookingsListPanel } from './BookingsListPanel.jsx';
import { CustomerDogsPanel } from './CustomerDogsPanel.jsx';

function ProfileSummary({ customer }) {
  return (
    <div className="customer-profile__summary">
      <div>
        <span>Name</span>
        <strong>{customer.name || 'Not set'}</strong>
      </div>
      <div>
        <span>Email</span>
        <strong>{customer.email || 'Not set'}</strong>
      </div>
      <div>
        <span>Phone</span>
        <strong>{customer.phone || 'Not set'}</strong>
      </div>
      <div>
        <span>Username</span>
        <strong>{customer.username || 'Not set'}</strong>
      </div>
    </div>
  );
}

function AccountSecurityPrompt({ customer, onCustomerChange }) {
  const [form, setForm] = useState({
    username: customer.username || '',
    password: '',
  });
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === 'saving') return;

    setError('');
    setMessage('');
    setStatus('saving');

    try {
      const supabase = requireSupabaseClient();
      let nextCustomer = customer;

      if (form.username.trim() !== (customer.username || '')) {
        const result = await updateCustomerForVerifiedUser(supabase, customer, {
          username: form.username,
        });
        nextCustomer = result.customer;
        onCustomerChange?.(result.customer);
      }

      if (form.password) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: form.password,
        });
        if (passwordError) {
          throw new Error(passwordError.message);
        }
      }

      setForm({
        username: nextCustomer.username || '',
        password: '',
      });
      setMessage('Account sign-in options updated.');
      setStatus('idle');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  return (
    <form className="account-security-form" onSubmit={handleSubmit}>
      <div className="login-panel__icon">
        <KeyRound size={18} />
      </div>
      <div>
        <h2>Optional password sign-in</h2>
        <p>Add a username and password if you want; magic links still work with this email.</p>
      </div>
      <label>
        <span>Username</span>
        <input
          aria-label="Username"
          autoComplete="username"
          pattern="[A-Za-z0-9_]{3,32}"
          value={form.username}
          onChange={(event) =>
            setForm((current) => ({ ...current, username: event.target.value }))
          }
          placeholder="mochi_parent"
        />
      </label>
      <label>
        <span>New password</span>
        <input
          aria-label="New password"
          autoComplete="new-password"
          minLength="6"
          type="password"
          value={form.password}
          onChange={(event) =>
            setForm((current) => ({ ...current, password: event.target.value }))
          }
        />
      </label>
      <button className="primary-action" type="submit" disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving...' : 'Save sign-in options'}
      </button>
      {message ? <p className="form-message">{message}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </form>
  );
}

function YourGroomerCard({ groomer, onRebook }) {
  if (!groomer) return null;

  return (
    <section className="signed-in-card your-groomer-card">
      <div className="login-panel__icon">
        <Heart size={18} />
      </div>
      <div>
        <h2>Your Groomer</h2>
        <p>{groomer.name}</p>
        <p className="muted">
          {groomer.rating && groomer.rating !== 'New' ? `${groomer.rating} stars` : 'Saved groomer'}{' '}
          {groomer.distanceLabel ? `· ${groomer.distanceLabel}` : ''}
        </p>
      </div>
      <button className="primary-action" type="button" onClick={() => onRebook?.(groomer)}>
        Rebook {groomer.name}
      </button>
    </section>
  );
}

function WaitlistCard() {
  return (
    <section className="signed-in-card waitlist-card">
      <div className="login-panel__icon">
        <CalendarPlus size={18} />
      </div>
      <div>
        <h2>Get Earlier Appointments</h2>
        <p>Join the cancellation waitlist display is ready; matching logic is not connected yet.</p>
      </div>
      <button className="primary-action" type="button" disabled>
        Join waitlist
      </button>
    </section>
  );
}

export function CustomerOwnershipPanel({
  favoriteGroomer = null,
  groomers = [],
  onRebookGroomer,
  selectedGroomer = null,
  selectedService = null,
}) {
  const [customer, setCustomer] = useState(null);
  const [dogs, setDogs] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  // Bump after a new booking request to make BookingsListPanel re-fetch
  // without it having to subscribe to anything from BookingRequestPanel.
  const [bookingsRefreshKey, setBookingsRefreshKey] = useState(0);
  const handleDogsChange = useCallback((nextDogs) => {
    setDogs(nextDogs);
  }, []);
  const handleBookingRequestCreated = useCallback(() => {
    setBookingsRefreshKey((tick) => tick + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomer() {
      setError('');
      setStatus('loading');

      try {
        const result = await loadCustomerForVerifiedUser(requireSupabaseClient());

        if (cancelled) return;

        if (result.customer) {
          setCustomer(result.customer);
          setForm({
            name: result.customer.name || '',
            phone: result.customer.phone || '',
          });
          setStatus('ready');
          return;
        }

        setForm({ name: '', phone: '' });
        setStatus('missing');
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message);
          setStatus('error');
        }
      }
    }

    loadCustomer();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === 'saving') return;

    setError('');
    setStatus('saving');

    try {
      const result = await createCustomerForVerifiedUser(requireSupabaseClient(), form);
      setCustomer(result.customer);
      setStatus('ready');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('missing');
    }
  }

  if (status === 'loading') {
    return (
      <section className="signed-in-card customer-profile" id="account">
        <div className="login-panel__icon">
          <UserRound size={18} />
        </div>
        <div>
          <h2>Loading customer profile...</h2>
          <p>Checking your signed-in account against your ShinyPawz customer row.</p>
        </div>
      </section>
    );
  }

  if (status === 'ready' && customer) {
    return (
      <>
        <section className="signed-in-card customer-profile" id="account">
          <div className="login-panel__icon">
            <UserRound size={18} />
          </div>
          <div>
            <h2>Customer profile ready</h2>
            <p>This profile is tied to your verified Supabase account.</p>
          </div>
          <ProfileSummary customer={customer} />
          <AccountSecurityPrompt customer={customer} onCustomerChange={setCustomer} />
        </section>
        <CustomerDogsPanel
          customer={customer}
          groomers={groomers}
          onDogsChange={handleDogsChange}
          selectedService={selectedService}
        />
        <YourGroomerCard
          groomer={favoriteGroomer || selectedGroomer || groomers[0] || null}
          onRebook={onRebookGroomer}
        />
        <WaitlistCard />
        <BookingRequestPanel
          customer={customer}
          dogs={dogs}
          groomers={groomers}
          onRequestCreated={handleBookingRequestCreated}
          selectedGroomer={selectedGroomer}
          selectedService={selectedService}
        />
        <BookingsListPanel customer={customer} refreshKey={bookingsRefreshKey} />
      </>
    );
  }

  return (
    <form className="signed-in-card customer-profile" id="account" onSubmit={handleSubmit}>
      <div className="login-panel__icon">
        <UserRound size={18} />
      </div>
      <div>
        <h2>Create your customer profile</h2>
        <p>This row is tied to your verified Supabase account before dog or booking data is created.</p>
      </div>
      <label>
        <span>Name</span>
        <input
          aria-label="Name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          required
        />
      </label>
      <label>
        <span>Phone</span>
        <input
          aria-label="Phone"
          value={form.phone}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          placeholder="+1 212 555 1212"
        />
      </label>
      <button className="primary-action" type="submit" disabled={status === 'saving'}>
        {status === 'saving' ? 'Creating...' : 'Create profile'}
      </button>
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </form>
  );
}

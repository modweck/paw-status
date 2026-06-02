import { useState } from 'react';

const EMPTY = { name: '', salon: '', phone: '', website: '', timezone: '', leadTimeHours: '' };

// Edits the groomer's business/contact + slot-config fields. Presentational:
// the parent supplies the current profile and an async onSave(fields).
export function BusinessDetailsForm({ profile, onSave }) {
  const [form, setForm] = useState({
    name: profile?.name || '',
    salon: profile?.salon || '',
    phone: profile?.phone || '',
    website: profile?.website || '',
    timezone: profile?.timezone || '',
    leadTimeHours: profile?.leadTimeHours ?? '',
  });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === 'saving') return;

    setError('');
    setMessage('');
    setStatus('saving');
    try {
      await onSave({
        name: form.name,
        salon: form.salon,
        phone: form.phone,
        website: form.website,
        timezone: form.timezone,
        leadTimeHours: form.leadTimeHours === '' ? 0 : Number(form.leadTimeHours),
      });
      setMessage('Business details saved.');
      setStatus('idle');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  return (
    <section className="signed-in-card groomer-panel">
      <div>
        <h3>Business details</h3>
        <p>Contact info and the timezone / lead time used to schedule your slots.</p>
      </div>
      <form className="groomer-business-form" onSubmit={handleSubmit}>
        <label>
          <span>Business name</span>
          <input aria-label="Business name" value={form.name} onChange={(e) => update('name', e.target.value)} required />
        </label>
        <label>
          <span>Salon</span>
          <input aria-label="Salon" value={form.salon} onChange={(e) => update('salon', e.target.value)} />
        </label>
        <label>
          <span>Phone</span>
          <input aria-label="Phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </label>
        <label>
          <span>Website</span>
          <input aria-label="Website" value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://" />
        </label>
        <label>
          <span>Timezone</span>
          <input
            aria-label="Timezone"
            value={form.timezone}
            onChange={(e) => update('timezone', e.target.value)}
            placeholder="America/New_York"
          />
        </label>
        <label>
          <span>Lead time (hours)</span>
          <input
            aria-label="Lead time (hours)"
            inputMode="numeric"
            min="0"
            type="number"
            value={form.leadTimeHours}
            onChange={(e) => update('leadTimeHours', e.target.value)}
          />
        </label>
        <button className="primary-action" type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving...' : 'Save business details'}
        </button>
        {message ? <p className="form-message">{message}</p> : null}
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </section>
  );
}

export { EMPTY as EMPTY_BUSINESS_DETAILS };

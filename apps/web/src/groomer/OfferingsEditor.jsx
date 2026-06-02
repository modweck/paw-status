import { useState } from 'react';

import { GROOMING_SERVICES } from '../data/services.js';

function serviceName(id) {
  return GROOMING_SERVICES.find((service) => service.id === id)?.name || id;
}

function dollarsToCents(value) {
  if (value === '' || value === null || value === undefined) return null;
  return Math.round(Number(value) * 100);
}

function centsToDollars(cents) {
  return cents === null || cents === undefined ? '' : String(cents / 100);
}

function OfferingRow({ offering, onUpdate, onDelete }) {
  const [duration, setDuration] = useState(String(offering.durationMinutes ?? ''));
  const [priceDollars, setPriceDollars] = useState(centsToDollars(offering.basePriceCents));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setError('');
    setBusy(true);
    try {
      await onUpdate(offering.id, {
        durationMinutes: Number(duration),
        basePriceCents: dollarsToCents(priceDollars),
      });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="offering-row">
      <span className="offering-row__service">{serviceName(offering.service)}</span>
      <label>
        <span>Minutes</span>
        <input
          aria-label={`Duration for ${serviceName(offering.service)}`}
          inputMode="numeric"
          type="number"
          min="1"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
      </label>
      <label>
        <span>Price ($)</span>
        <input
          aria-label={`Price for ${serviceName(offering.service)}`}
          inputMode="decimal"
          type="number"
          min="0"
          value={priceDollars}
          onChange={(event) => setPriceDollars(event.target.value)}
        />
      </label>
      <button type="button" disabled={busy} onClick={handleSave}>
        Save
      </button>
      <button type="button" onClick={() => onDelete(offering.id)}>
        Remove
      </button>
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </li>
  );
}

// Manage a groomer's bookable service offerings. Presentational: the parent
// supplies the list and async onCreate / onUpdate / onDelete callbacks.
export function OfferingsEditor({ offerings = [], onCreate, onUpdate, onDelete }) {
  const [form, setForm] = useState({
    service: GROOMING_SERVICES[0].id,
    durationMinutes: '',
    priceDollars: '',
  });
  const [error, setError] = useState('');

  async function handleAdd(event) {
    event.preventDefault();
    setError('');
    try {
      await onCreate({
        service: form.service,
        durationMinutes: Number(form.durationMinutes),
        basePriceCents: dollarsToCents(form.priceDollars),
      });
      setForm({ service: GROOMING_SERVICES[0].id, durationMinutes: '', priceDollars: '' });
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  return (
    <section className="signed-in-card groomer-panel">
      <div>
        <h3>Services &amp; pricing</h3>
        <p>The services you offer, how long each takes, and your base price.</p>
      </div>

      {offerings.length ? (
        <ul className="offering-list">
          {offerings.map((offering) => (
            <OfferingRow
              key={offering.id}
              offering={offering}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : (
        <p className="empty-state">No services yet. Add your first below.</p>
      )}

      <form className="offering-add-form" onSubmit={handleAdd}>
        <label>
          <span>Service</span>
          <select
            aria-label="Service"
            value={form.service}
            onChange={(event) => setForm((current) => ({ ...current, service: event.target.value }))}
          >
            {GROOMING_SERVICES.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Minutes</span>
          <input
            aria-label="New offering duration"
            inputMode="numeric"
            type="number"
            min="1"
            value={form.durationMinutes}
            onChange={(event) =>
              setForm((current) => ({ ...current, durationMinutes: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Price ($)</span>
          <input
            aria-label="New offering price"
            inputMode="decimal"
            type="number"
            min="0"
            value={form.priceDollars}
            onChange={(event) =>
              setForm((current) => ({ ...current, priceDollars: event.target.value }))
            }
          />
        </label>
        <button className="primary-action" type="submit">
          Add service
        </button>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </section>
  );
}

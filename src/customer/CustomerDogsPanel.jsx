import { CalendarClock, PawPrint } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  createDogForCustomer,
  DOG_SIZE_OPTIONS,
  loadDogsForCustomer,
} from '../api/dogs.js';
import { GROOMING_SERVICES, groupGroomingServices } from '../data/services.js';
import { requireSupabaseClient } from '../lib/supabaseClient.js';

function createInitialDogForm(selectedService) {
  return {
    name: '',
    breed: '',
    size: 'medium',
    birthdate: '',
    weightLbs: '',
    coatType: '',
    temperament: '',
    allergies: '',
    preferredServiceId: selectedService?.id || '',
    preferredGroomerId: '',
    preferredGroomerName: '',
    lastGroomedAt: '',
    groomingIntervalWeeks: '',
    notes: '',
  };
}

function dogSizeLabel(value) {
  return DOG_SIZE_OPTIONS.find((option) => option.value === value)?.label || 'Size not set';
}

function serviceName(value) {
  return GROOMING_SERVICES.find((service) => service.id === value)?.name || '';
}

function groomerName(groomers, groomerId) {
  return groomers.find((groomer) => groomer.id === groomerId)?.name || '';
}

function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDogDate(value) {
  const date = parseDateOnly(value);
  if (!date) return 'Not set';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function addWeeks(date, weeks) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + weeks * 7);
  return nextDate;
}

function getGroomingStatus(dog) {
  const interval = Number(dog.groomingIntervalWeeks);
  const lastVisit = parseDateOnly(dog.lastGroomedAt);
  if (!lastVisit || !Number.isFinite(interval) || interval <= 0) {
    return {
      title: `${dog.name || 'Your dog'} grooming tracker`,
      dueDate: '',
      detail: 'Add the last visit and usual cadence to track the next groom.',
      tone: 'neutral',
    };
  }

  const dueDate = addWeeks(lastVisit, interval);
  const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);

  if (daysUntilDue <= 14) {
    return {
      title: `${dog.name} Needs Grooming Soon`,
      dueDate: formatDogDate(dueDate.toISOString().slice(0, 10)),
      detail: daysUntilDue < 0 ? 'Past the usual grooming window.' : 'Inside the next two weeks.',
      tone: 'soon',
    };
  }

  return {
    title: `${dog.name} is on track`,
    dueDate: formatDogDate(dueDate.toISOString().slice(0, 10)),
    detail: `${daysUntilDue} days until the usual grooming window.`,
    tone: 'ok',
  };
}

function DogTrackerCard({ dog }) {
  const status = getGroomingStatus(dog);

  return (
    <article className={`dog-tracker dog-tracker--${status.tone}`}>
      <div className="dog-tracker__icon">
        <CalendarClock size={18} />
      </div>
      <div>
        <h3>{status.title}</h3>
        <p>Last visit: {formatDogDate(dog.lastGroomedAt)}</p>
        <p>
          Usual cadence:{' '}
          {dog.groomingIntervalWeeks
            ? `every ${dog.groomingIntervalWeeks} weeks`
            : 'not set'}
        </p>
        {status.dueDate ? <p>Next target: {status.dueDate}</p> : null}
        <p>{status.detail}</p>
      </div>
    </article>
  );
}

function DogList({ dogs }) {
  if (!dogs.length) {
    return <p className="empty-state">No dog profiles yet.</p>;
  }

  return (
    <div className="dog-list">
      {dogs.map((dog) => (
        <article aria-label={`${dog.name} profile`} className="dog-item" key={dog.id}>
          <DogTrackerCard dog={dog} />
          <div className="dog-item__header">
            <div>
              <h3>{dog.name}</h3>
              <p>{dog.breed || 'Breed not set'}</p>
            </div>
            <span>{dogSizeLabel(dog.size)}</span>
          </div>
          <dl className="dog-details">
            <div>
              <dt>Birthday</dt>
              <dd>{formatDogDate(dog.birthdate)}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{dog.weightLbs ? `${dog.weightLbs} lb` : 'Not set'}</dd>
            </div>
            <div>
              <dt>Coat</dt>
              <dd>{dog.coatType || 'Not set'}</dd>
            </div>
            <div>
              <dt>Temperament</dt>
              <dd>{dog.temperament || 'Not set'}</dd>
            </div>
            <div>
              <dt>Allergies</dt>
              <dd>{dog.allergies || 'None listed'}</dd>
            </div>
            <div>
              <dt>Preferred service</dt>
              <dd>{serviceName(dog.preferredServiceId) || 'Not set'}</dd>
            </div>
            <div>
              <dt>Preferred groomer</dt>
              <dd>{dog.preferredGroomerName || 'Not set'}</dd>
            </div>
          </dl>
          {dog.notes ? <p className="dog-item__notes">{dog.notes}</p> : null}
        </article>
      ))}
    </div>
  );
}

export function CustomerDogsPanel({
  customer,
  groomers = [],
  onDogsChange,
  selectedService = null,
}) {
  const [dogs, setDogs] = useState([]);
  const [form, setForm] = useState(() => createInitialDogForm(selectedService));
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    onDogsChange?.(dogs);
  }, [dogs, onDogsChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadDogs() {
      setError('');
      setStatus('loading');

      try {
        const nextDogs = await loadDogsForCustomer(requireSupabaseClient(), customer);
        if (!cancelled) {
          setDogs(nextDogs);
          setStatus('ready');
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message);
          setStatus('error');
        }
      }
    }

    loadDogs();

    return () => {
      cancelled = true;
    };
  }, [customer]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === 'saving') return;

    setError('');
    setStatus('saving');

    try {
      const preferredGroomerName = groomerName(groomers, form.preferredGroomerId);
      const dog = await createDogForCustomer(requireSupabaseClient(), customer, {
        ...form,
        preferredGroomerName,
      });
      setDogs((current) => [...current, dog]);
      setForm(createInitialDogForm(selectedService));
      setStatus('ready');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('ready');
    }
  }

  return (
    <section className="signed-in-card dogs-panel" id="dogs">
      <div className="login-panel__icon">
        <PawPrint size={18} />
      </div>
      <div>
        <h2>My Dog</h2>
        <p>Save the details groomers need so booking requests can auto-populate the basics.</p>
      </div>

      {status === 'loading' ? (
        <p className="empty-state">Loading dog profiles...</p>
      ) : (
        <DogList dogs={dogs} />
      )}

      <form className="dog-form" onSubmit={handleSubmit}>
        <label>
          <span>Dog name</span>
          <input
            aria-label="Dog name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </label>
        <label>
          <span>Breed</span>
          <input
            aria-label="Breed"
            value={form.breed}
            onChange={(event) => setForm((current) => ({ ...current, breed: event.target.value }))}
          />
        </label>
        <label>
          <span>Size</span>
          <select
            aria-label="Size"
            value={form.size}
            onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))}
          >
            {DOG_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="dog-form__grid">
          <label>
            <span>Birthday</span>
            <input
              aria-label="Birthday"
              type="date"
              value={form.birthdate}
              onChange={(event) =>
                setForm((current) => ({ ...current, birthdate: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Weight</span>
            <input
              aria-label="Weight in pounds"
              inputMode="decimal"
              min="1"
              type="number"
              value={form.weightLbs}
              onChange={(event) =>
                setForm((current) => ({ ...current, weightLbs: event.target.value }))
              }
            />
          </label>
        </div>
        <label>
          <span>Coat type</span>
          <input
            aria-label="Coat type"
            value={form.coatType}
            onChange={(event) =>
              setForm((current) => ({ ...current, coatType: event.target.value }))
            }
            placeholder="Curly, double coat, wire, short"
          />
        </label>
        <label>
          <span>Temperament</span>
          <input
            aria-label="Temperament"
            value={form.temperament}
            onChange={(event) =>
              setForm((current) => ({ ...current, temperament: event.target.value }))
            }
            placeholder="Nervous, senior, high energy"
          />
        </label>
        <label>
          <span>Allergies</span>
          <input
            aria-label="Allergies"
            value={form.allergies}
            onChange={(event) =>
              setForm((current) => ({ ...current, allergies: event.target.value }))
            }
            placeholder="Food, shampoo, medication"
          />
        </label>
        <div className="dog-form__grid">
          <label>
            <span>Preferred service</span>
            <select
              aria-label="Preferred service"
              value={form.preferredServiceId}
              onChange={(event) =>
                setForm((current) => ({ ...current, preferredServiceId: event.target.value }))
              }
            >
              <option value="">No preference</option>
              {groupGroomingServices().map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            <span>Preferred groomer</span>
            <select
              aria-label="Preferred groomer"
              value={form.preferredGroomerId}
              onChange={(event) =>
                setForm((current) => ({ ...current, preferredGroomerId: event.target.value }))
              }
            >
              <option value="">No preference</option>
              {groomers.map((groomer) => (
                <option key={groomer.id} value={groomer.id}>
                  {groomer.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dog-form__grid">
          <label>
            <span>Last groomed</span>
            <input
              aria-label="Last groomed"
              type="date"
              value={form.lastGroomedAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, lastGroomedAt: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Cadence</span>
            <input
              aria-label="Grooming cadence"
              inputMode="numeric"
              min="1"
              type="number"
              value={form.groomingIntervalWeeks}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  groomingIntervalWeeks: event.target.value,
                }))
              }
              placeholder="6"
            />
          </label>
        </div>
        <label>
          <span>Notes</span>
          <textarea
            aria-label="Notes"
            rows="3"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </label>
        <button className="primary-action" type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Adding...' : 'Add dog'}
        </button>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </section>
  );
}

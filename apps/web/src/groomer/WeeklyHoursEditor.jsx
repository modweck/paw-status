import { useState } from 'react';

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function dayLabel(value) {
  return DAYS.find((day) => day.value === value)?.label || '';
}

function WeeklyRow({ window, onUpdate, onDelete }) {
  const [openTime, setOpenTime] = useState(window.openTime);
  const [closeTime, setCloseTime] = useState(window.closeTime);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setError('');
    setBusy(true);
    try {
      await onUpdate(window.id, { dayOfWeek: window.dayOfWeek, openTime, closeTime });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="weekly-row">
      <span className="weekly-row__day">{dayLabel(window.dayOfWeek)}</span>
      <label>
        <span>Open</span>
        <input
          aria-label={`${dayLabel(window.dayOfWeek)} open time`}
          type="time"
          value={openTime}
          onChange={(event) => setOpenTime(event.target.value)}
        />
      </label>
      <label>
        <span>Close</span>
        <input
          aria-label={`${dayLabel(window.dayOfWeek)} close time`}
          type="time"
          value={closeTime}
          onChange={(event) => setCloseTime(event.target.value)}
        />
      </label>
      <button type="button" disabled={busy} onClick={handleSave}>
        Save
      </button>
      <button type="button" onClick={() => onDelete(window.id)}>
        Remove
      </button>
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </li>
  );
}

// Manage recurring weekly hours. Presentational: the parent supplies the list
// and async onCreate / onUpdate / onDelete (overlap is validated in the API).
export function WeeklyHoursEditor({ weeklyHours = [], onCreate, onUpdate, onDelete }) {
  const [form, setForm] = useState({ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' });
  const [error, setError] = useState('');

  async function handleAdd(event) {
    event.preventDefault();
    setError('');
    try {
      await onCreate({
        dayOfWeek: Number(form.dayOfWeek),
        openTime: form.openTime,
        closeTime: form.closeTime,
      });
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  return (
    <section className="signed-in-card groomer-panel">
      <div>
        <h3>Weekly hours</h3>
        <p>When you&apos;re open each week. Add a separate window for split shifts.</p>
      </div>

      {weeklyHours.length ? (
        <ul className="weekly-list">
          {weeklyHours.map((window) => (
            <WeeklyRow key={window.id} window={window} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </ul>
      ) : (
        <p className="empty-state">No hours set yet.</p>
      )}

      <form className="weekly-add-form" onSubmit={handleAdd}>
        <label>
          <span>Day</span>
          <select
            aria-label="Day"
            value={form.dayOfWeek}
            onChange={(event) => setForm((current) => ({ ...current, dayOfWeek: event.target.value }))}
          >
            {DAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Open</span>
          <input
            aria-label="New window open time"
            type="time"
            value={form.openTime}
            onChange={(event) => setForm((current) => ({ ...current, openTime: event.target.value }))}
          />
        </label>
        <label>
          <span>Close</span>
          <input
            aria-label="New window close time"
            type="time"
            value={form.closeTime}
            onChange={(event) => setForm((current) => ({ ...current, closeTime: event.target.value }))}
          />
        </label>
        <button className="primary-action" type="submit">
          Add hours
        </button>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </section>
  );
}

import { useState } from 'react';

function formatRange(startAt, endAt) {
  return `${startAt} → ${endAt}`;
}

// Manage ad-hoc time off. Presentational: the parent supplies the list and
// async onCreate / onDelete.
export function TimeOffEditor({ timeOff = [], onCreate, onDelete }) {
  const [form, setForm] = useState({ startAt: '', endAt: '' });
  const [error, setError] = useState('');

  async function handleAdd(event) {
    event.preventDefault();
    setError('');
    try {
      await onCreate({ startAt: form.startAt, endAt: form.endAt });
      setForm({ startAt: '', endAt: '' });
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  return (
    <section className="signed-in-card groomer-panel">
      <div>
        <h3>Time off</h3>
        <p>Vacations or closures. These block bookings for the dates you choose.</p>
      </div>

      {timeOff.length ? (
        <ul className="time-off-list">
          {timeOff.map((block) => (
            <li key={block.id} className="time-off-row">
              <span>{formatRange(block.startAt, block.endAt)}</span>
              <button type="button" onClick={() => onDelete(block.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">No time off scheduled.</p>
      )}

      <form className="time-off-add-form" onSubmit={handleAdd}>
        <label>
          <span>Start</span>
          <input
            aria-label="Time off start"
            type="datetime-local"
            value={form.startAt}
            onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))}
          />
        </label>
        <label>
          <span>End</span>
          <input
            aria-label="Time off end"
            type="datetime-local"
            value={form.endAt}
            onChange={(event) => setForm((current) => ({ ...current, endAt: event.target.value }))}
          />
        </label>
        <button className="primary-action" type="submit">
          Add time off
        </button>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </section>
  );
}

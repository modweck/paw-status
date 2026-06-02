import { TIME_OF_DAY_OPTIONS } from '../api/bookingRequests.js';

// Shared "requested timing" fieldset: first-available toggle plus preferred and
// backup date / time-of-day / optional exact time. Controlled via a single
// values object and an onChange(field, value) callback.
export function BookingTimingFieldset({ values, onChange }) {
  const {
    firstAvailable,
    preferredDate,
    preferredTimeOfDay,
    preferredTime,
    backupDate,
    backupTimeOfDay,
    backupTime,
  } = values;

  return (
    <fieldset>
      <legend>Requested timing</legend>
      <label className="window-option">
        <input
          aria-label="First available"
          checked={firstAvailable}
          onChange={(event) => onChange('firstAvailable', event.target.checked)}
          type="checkbox"
        />
        <span>First available is okay</span>
      </label>
      <div className="booking-request-form__grid">
        <label>
          <span>Preferred date</span>
          <input
            aria-label="Preferred date"
            type="date"
            value={preferredDate}
            onChange={(event) => onChange('preferredDate', event.target.value)}
          />
        </label>
        <label>
          <span>Preferred time of day</span>
          <select
            aria-label="Preferred time of day"
            value={preferredTimeOfDay}
            onChange={(event) => onChange('preferredTimeOfDay', event.target.value)}
          >
            {TIME_OF_DAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Preferred time (optional)</span>
          <input
            aria-label="Preferred time (optional)"
            type="time"
            value={preferredTime}
            onChange={(event) => onChange('preferredTime', event.target.value)}
          />
        </label>
        <label>
          <span>Backup date</span>
          <input
            aria-label="Backup date"
            type="date"
            value={backupDate}
            onChange={(event) => onChange('backupDate', event.target.value)}
          />
        </label>
        <label>
          <span>Backup time of day</span>
          <select
            aria-label="Backup time of day"
            value={backupTimeOfDay}
            onChange={(event) => onChange('backupTimeOfDay', event.target.value)}
          >
            {TIME_OF_DAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Backup time (optional)</span>
          <input
            aria-label="Backup time (optional)"
            type="time"
            value={backupTime}
            onChange={(event) => onChange('backupTime', event.target.value)}
          />
        </label>
      </div>
      <p className="form-hint">
        Exact times are a request — the groomer confirms the final time.
      </p>
    </fieldset>
  );
}

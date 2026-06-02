import { groupGroomingServices } from '../data/services.js';

// Shared groomer + service selects used by the booking form. Presentational
// only: the parent owns state and the service-option list.
export function GroomerServiceFields({
  groomers,
  groomerId,
  onGroomerChange,
  serviceOptions,
  service,
  onServiceChange,
  required = false,
}) {
  return (
    <>
      <label>
        <span>Groomer</span>
        <select
          aria-label="Groomer"
          required={required}
          value={groomerId}
          onChange={(event) => onGroomerChange(event.target.value)}
        >
          {groomers.map((groomer) => (
            <option key={groomer.id} value={groomer.id}>
              {groomer.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Service</span>
        <select
          aria-label="Service"
          required={required}
          value={service}
          onChange={(event) => onServiceChange(event.target.value)}
        >
          {groupGroomingServices(serviceOptions).map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.services.map((serviceOption) => (
                <option key={serviceOption.id} value={serviceOption.id}>
                  {serviceOption.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </>
  );
}

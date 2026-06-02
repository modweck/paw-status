import { MODE_CUSTOMER, MODE_GROOMER } from './modePreference.js';

const OPTIONS = [
  { mode: MODE_CUSTOMER, label: 'Dog owner' },
  { mode: MODE_GROOMER, label: 'Groomer' },
];

// Top-bar segmented control to switch between the customer and groomer views.
// Presentational: the parent owns the current mode and navigation.
export function RoleToggle({ mode, onSwitch }) {
  return (
    <div className="role-toggle" role="group" aria-label="Switch between dog owner and groomer">
      {OPTIONS.map((option) => {
        const isActive = mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            className={isActive ? 'role-toggle__option is-active' : 'role-toggle__option'}
            aria-pressed={isActive}
            onClick={() => {
              if (!isActive) onSwitch?.(option.mode);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

import { Trash2 } from 'lucide-react';

/**
 * Editor component for managing service offerings.
 *
 * @param {Object} props
 * @param {Array<{service: string, durationMinutes: number, basePriceCents: number}>} props.offerings - Array of service offerings
 * @param {Function} props.onChange - Callback when offerings change: (newOfferings) => void
 */
export function ServiceOfferingsEditor({ offerings = [], onChange }) {
  const handleAddService = () => {
    const newOffering = {
      service: '',
      durationMinutes: 60,
      basePriceCents: 5000,
    };
    onChange([...offerings, newOffering]);
  };

  const handleUpdateOffering = (index, updatedOffering) => {
    const newOfferings = offerings.map((offering, i) => (i === index ? updatedOffering : offering));
    onChange(newOfferings);
  };

  const handleRemoveOffering = (index) => {
    const newOfferings = offerings.filter((_, i) => i !== index);
    onChange(newOfferings);
  };

  const formatPrice = (cents) => {
    if (typeof cents !== 'number') return '';
    return (cents / 100).toFixed(2);
  };

  const parsePriceInput = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : Math.round(num * 100);
  };

  return (
    <div className="service-offerings-editor">
      <div className="editor-blocks">
        {offerings.length === 0 ? (
          <p className="editor-empty-message">No services added yet.</p>
        ) : (
          offerings.map((offering, index) => (
            <div key={index} className="editor-block offering-block">
              <div className="block-field">
                <label>Service Name</label>
                <input
                  type="text"
                  value={offering.service || ''}
                  onChange={(event) =>
                    handleUpdateOffering(index, {
                      ...offering,
                      service: event.target.value,
                    })
                  }
                  className="input-field"
                  placeholder="e.g., Bath & Haircut"
                  required
                />
              </div>

              <div className="block-field">
                <label>Duration (minutes)</label>
                <input
                  type="number"
                  value={offering.durationMinutes || ''}
                  onChange={(event) =>
                    handleUpdateOffering(index, {
                      ...offering,
                      durationMinutes: parseInt(event.target.value, 10) || 0,
                    })
                  }
                  className="input-field"
                  min="1"
                  required
                />
              </div>

              <div className="block-field">
                <label>Base Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formatPrice(offering.basePriceCents)}
                  onChange={(event) =>
                    handleUpdateOffering(index, {
                      ...offering,
                      basePriceCents: parsePriceInput(event.target.value),
                    })
                  }
                  className="input-field"
                  placeholder="0.00"
                  required
                />
              </div>

              <button
                type="button"
                onClick={() => handleRemoveOffering(index)}
                className="remove-button"
                aria-label="Remove service"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </div>

      <button type="button" onClick={handleAddService} className="secondary-action add-button">
        + Add service
      </button>
    </div>
  );
}

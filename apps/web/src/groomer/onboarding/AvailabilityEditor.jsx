import { Trash2 } from 'lucide-react';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Editor component for managing weekly availability blocks.
 *
 * @param {Object} props
 * @param {Array<{dayOfWeek: number, openTime: string, closeTime: string}>} props.blocks - Array of availability blocks
 * @param {Function} props.onChange - Callback when blocks change: (newBlocks) => void
 */
export function AvailabilityEditor({ blocks = [], onChange }) {
  const handleAddBlock = () => {
    const newBlock = {
      dayOfWeek: 0,
      openTime: '09:00',
      closeTime: '17:00',
    };
    onChange([...blocks, newBlock]);
  };

  const handleUpdateBlock = (index, updatedBlock) => {
    const newBlocks = blocks.map((block, i) => (i === index ? updatedBlock : block));
    onChange(newBlocks);
  };

  const handleRemoveBlock = (index) => {
    const newBlocks = blocks.filter((_, i) => i !== index);
    onChange(newBlocks);
  };

  return (
    <div className="availability-editor">
      <div className="editor-blocks">
        {blocks.length === 0 ? (
          <p className="editor-empty-message">No availability blocks added yet.</p>
        ) : (
          blocks.map((block, index) => (
            <div key={index} className="editor-block availability-block">
              <div className="block-field">
                <label>Day</label>
                <select
                  value={block.dayOfWeek}
                  onChange={(event) =>
                    handleUpdateBlock(index, {
                      ...block,
                      dayOfWeek: parseInt(event.target.value, 10),
                    })
                  }
                  className="input-field"
                >
                  {WEEKDAYS.map((day, dayIndex) => (
                    <option key={dayIndex} value={dayIndex}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div className="block-field">
                <label>Open Time</label>
                <input
                  type="time"
                  value={block.openTime || ''}
                  onChange={(event) =>
                    handleUpdateBlock(index, {
                      ...block,
                      openTime: event.target.value,
                    })
                  }
                  className="input-field"
                  required
                />
              </div>

              <div className="block-field">
                <label>Close Time</label>
                <input
                  type="time"
                  value={block.closeTime || ''}
                  onChange={(event) =>
                    handleUpdateBlock(index, {
                      ...block,
                      closeTime: event.target.value,
                    })
                  }
                  className="input-field"
                  required
                />
              </div>

              <button
                type="button"
                onClick={() => handleRemoveBlock(index)}
                className="remove-button"
                aria-label="Remove block"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </div>

      <button type="button" onClick={handleAddBlock} className="secondary-action add-button">
        + Add availability block
      </button>
    </div>
  );
}

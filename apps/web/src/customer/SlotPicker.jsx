import { useEffect, useState } from 'react';

import { fetchAvailableSlots } from '../api/availability.js';

/**
 * @typedef {Object} Slot
 * @property {string} slotId - Unique identifier for the slot
 * @property {string} startTime - ISO 8601 timestamp of slot start
 */

/**
 * @typedef {Object} SlotPickerProps
 * @property {string} groomerId - ID of the selected groomer
 * @property {string} serviceId - ID of the selected service
 * @property {Object} supabase - Supabase client (reserved for future use)
 * @property {(slot: Slot) => void} onPick - Callback when a slot is selected
 */

/**
 * SlotPicker - Renders available booking slots grouped by calendar day
 * @param {SlotPickerProps} props
 */
export function SlotPicker({ groomerId, serviceId, supabase, onPick }) {
  const [isLoading, setIsLoading] = useState(false);
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    if (!groomerId || !serviceId) return;

    async function fetchSlots() {
      setIsLoading(true);
      try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        const to = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

        const availableSlots = await fetchAvailableSlots({
          groomerId,
          serviceId,
          from,
          to,
        });
        setSlots(availableSlots);
      } catch (error) {
        setSlots([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSlots();
  }, [groomerId, serviceId]);

  // Group slots by calendar day
  const groupedSlots = slots.reduce((acc, slot) => {
    const date = new Date(slot.startTime);
    const dateKey = date.toISOString().split('T')[0];
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(slot);
    return acc;
  }, {});

  if (isLoading) {
    return <div className="slot-picker-loading">Loading available slots...</div>;
  }

  if (slots.length === 0) {
    return <div className="slot-picker-empty">No available slots in the next 30 days</div>;
  }

  return (
    <div className="slot-picker">
      {Object.entries(groupedSlots)
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([date, daySlots]) => (
          <div key={date} className="slot-picker__day-group">
            <h3 className="slot-picker__day-label">{new Date(date).toLocaleDateString()}</h3>
            <div className="slot-picker__slots">
              {daySlots.map((slot) => (
                <button
                  key={slot.slotId}
                  className="slot-picker__slot"
                  onClick={() => onPick(slot)}
                  type="button"
                >
                  {new Date(slot.startTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

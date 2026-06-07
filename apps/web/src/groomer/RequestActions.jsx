import { useState } from 'react';

import { confirmRequest, declineRequest } from '../api/appointments.js';
import { SlotPicker } from '../customer/SlotPicker.jsx';

/**
 * RequestActions - Render Accept/Decline actions for a groomer's booking request
 *
 * @param {Object} props
 * @param {Object} props.request - The appointment request
 * @param {Object} props.supabase - Supabase client
 * @param {Function} props.onAction - Callback when action completes
 */
export function RequestActions({ request, supabase, onAction }) {
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAccept() {
    setShowSlotPicker(true);
  }

  async function handleSlotPicked(slot) {
    setIsLoading(true);
    setError('');

    try {
      await confirmRequest(supabase, request.id, slot.startTime);
      setShowSlotPicker(false);
      if (typeof onAction === 'function') {
        onAction();
      }
    } catch (nextError) {
      // Check for the specific error message about the slot being taken
      if (nextError.message?.includes('That time was just booked')) {
        setError('That time was just booked. Please select another slot.');
      } else {
        setError(nextError.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDecline() {
    setIsLoading(true);
    setError('');

    try {
      await declineRequest(supabase, request.id);
      if (typeof onAction === 'function') {
        onAction();
      }
    } catch (nextError) {
      setError(nextError.message);
      setIsLoading(false);
    }
  }

  if (showSlotPicker) {
    return (
      <div className="request-actions">
        <button
          className="back-button"
          onClick={() => setShowSlotPicker(false)}
          type="button"
          disabled={isLoading}
        >
          Back
        </button>
        <SlotPicker
          groomerId={request.groomerId}
          serviceId={request.service || ''}
          supabase={supabase}
          onPick={handleSlotPicked}
        />
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="request-actions">
      <button
        className="primary-action"
        onClick={handleAccept}
        type="button"
        disabled={isLoading}
      >
        Accept
      </button>
      <button
        className="secondary-action"
        onClick={handleDecline}
        type="button"
        disabled={isLoading}
      >
        {isLoading ? 'Processing...' : 'Decline'}
      </button>
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </div>
  );
}

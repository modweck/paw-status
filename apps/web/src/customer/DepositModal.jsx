import { AlertCircle, X } from 'lucide-react';
import { useState } from 'react';

import { createDepositIntent } from '../api/payments.js';

/**
 * Modal for collecting deposit payment
 * @param {Object} props - Component props
 * @param {Object} props.supabase - Supabase client
 * @param {string} props.appointmentId - Appointment ID
 * @param {Function} props.onPaid - Callback on successful payment
 * @param {Function} props.onClose - Callback to close modal
 */
export function DepositModal({ supabase, appointmentId, onPaid, onClose }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function handlePayDeposit() {
    if (status === 'paying') return;

    setStatus('paying');
    setError('');

    try {
      await createDepositIntent(supabase, appointmentId);
      setStatus('success');
      onPaid();
    } catch (caught) {
      setError(caught?.message || 'Could not process deposit payment.');
      setStatus('error');
    }
  }

  return (
    <dialog className="deposit-modal" open>
      <div className="deposit-modal__backdrop" onClick={onClose} />
      <div className="deposit-modal__content">
        <button
          aria-label="Close"
          className="deposit-modal__close"
          onClick={onClose}
          type="button"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div className="deposit-modal__header">
          <h2>Payment deposit</h2>
        </div>

        <div className="deposit-modal__body">
          <div className="deposit-modal__disclaimer">
            <AlertCircle size={20} aria-hidden="true" />
            <label>Demo payment — no real card is charged.</label>
          </div>

          {error ? (
            <p className="form-message form-message--error">{error}</p>
          ) : null}

          <button
            className="primary-action"
            disabled={status === 'paying'}
            onClick={handlePayDeposit}
            type="button"
          >
            {status === 'paying' ? 'Processing...' : 'Pay deposit'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

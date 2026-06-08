import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { connectGbp } from '../api/gbp.js';

/**
 * Button to connect Google Business Profile
 * @param {Object} props - Component props
 * @param {Object} props.supabase - Supabase client
 * @param {string|null} props.groomerId - Groomer ID (null if not available)
 */
export function GbpConnectButton({ supabase, groomerId }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function handleConnect() {
    if (status === 'connecting' || !groomerId) return;

    setStatus('connecting');
    setError('');

    try {
      await connectGbp(supabase, groomerId);
      setStatus('verified');
    } catch (caught) {
      setError(caught?.message || 'Could not connect Google Business Profile.');
      setStatus('error');
    }
  }

  if (status === 'verified') {
    return (
      <div className="gbp-verified-badge">
        <CheckCircle2 size={20} aria-hidden="true" />
        <span>✓ Google-verified</span>
      </div>
    );
  }

  return (
    <>
      <button
        className="primary-action"
        disabled={status === 'connecting' || !groomerId}
        onClick={handleConnect}
        type="button"
      >
        {status === 'connecting' ? 'Connecting...' : 'Connect Google Business Profile'}
      </button>
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </>
  );
}

import { Star } from 'lucide-react';
import { useState } from 'react';

import { linkGroomerBusiness, searchGroomerBusinesses } from '../api/groomerBusiness.js';
import { requestGroomerMembership } from '../api/groomerAccounts.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { requireSupabaseClient } from '../lib/supabaseClient.js';
import { GooglePlacePhoto } from '../customer/GooglePlacePhoto.jsx';

// Lets a groomer find their business on Google and add it. The server creates
// the groomers row from the chosen place; we then file a pending membership
// (the existing admin-verified path) so they get edit rights once approved.
export function AddYourBusiness({ account, setWorkspace }) {
  const { session } = useAuth();
  const accessToken = session?.access_token || '';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [addedName, setAddedName] = useState('');

  async function handleSearch(event) {
    event.preventDefault();
    if (status === 'searching') return;

    setStatus('searching');
    setError('');
    setAddedName('');
    try {
      const nextResults = await searchGroomerBusinesses(accessToken, query);
      setResults(nextResults);
      setStatus('idle');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  async function handleAdd(candidate) {
    if (status === 'adding') return;

    setStatus('adding');
    setError('');
    try {
      const groomer = await linkGroomerBusiness(accessToken, candidate.placeId);
      const membership = await requestGroomerMembership(requireSupabaseClient(), account, groomer.id);
      setWorkspace((current) => ({
        ...current,
        memberships: [...current.memberships, membership],
      }));
      setAddedName(groomer.name || candidate.name);
      setResults([]);
      setStatus('idle');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  if (addedName) {
    return (
      <div className="add-business-done">
        <p>
          <strong>{addedName}</strong> was added and sent for verification. You can edit your
          services and hours once an admin approves your claim.
        </p>
      </div>
    );
  }

  return (
    <>
      <form className="groomer-form" onSubmit={handleSearch}>
        <label>
          <span>Search Google for your business</span>
          <input
            aria-label="Business name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. Paw House Grooming Brooklyn"
            required
          />
        </label>
        <button className="primary-action" type="submit" disabled={status === 'searching'}>
          {status === 'searching' ? 'Searching...' : 'Search Google'}
        </button>
      </form>

      {results.length ? (
        <div className="membership-list">
          {results.map((result) => (
            <article className="membership-item" key={result.placeId}>
              <GooglePlacePhoto placeId={result.placeId} />
              <div>
                <h3>{result.name}</h3>
                <p>{result.address}</p>
                {result.rating ? (
                  <p className="muted">
                    <Star size={12} fill="currentColor" /> {result.rating}
                    {result.reviewCount ? ` (${result.reviewCount})` : ''}
                  </p>
                ) : null}
              </div>
              <button type="button" disabled={status === 'adding'} onClick={() => handleAdd(result)}>
                This is my business
              </button>
            </article>
          ))}
        </div>
      ) : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </>
  );
}

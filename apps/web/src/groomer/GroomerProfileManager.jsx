import { useCallback, useEffect, useState } from 'react';

import {
  createOffering,
  deleteOffering,
  loadOfferings,
  updateOffering,
} from '../api/groomerOfferings.js';
import {
  createTimeOff,
  createWeeklyHours,
  deleteTimeOff,
  deleteWeeklyHours,
  loadTimeOff,
  loadWeeklyHours,
  updateWeeklyHours,
} from '../api/groomerAvailability.js';
import { loadGroomerProfile, updateGroomerBusinessDetails } from '../api/groomerProfile.js';
import { requireSupabaseClient } from '../lib/supabaseClient.js';
import { BusinessDetailsForm } from './BusinessDetailsForm.jsx';
import { OfferingsEditor } from './OfferingsEditor.jsx';
import { TimeOffEditor } from './TimeOffEditor.jsx';
import { WeeklyHoursEditor } from './WeeklyHoursEditor.jsx';

// Self-service editor for a verified groomer's business profile, services, and
// availability. Loads data for the active verified profile (with a selector
// when the account owns more than one) and wires the section editors to the
// RLS-backed API modules.
export function GroomerProfileManager({ verifiedMemberships = [] }) {
  const [activeGroomerId, setActiveGroomerId] = useState(verifiedMemberships[0]?.groomerId || '');
  const [profile, setProfile] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [weeklyHours, setWeeklyHours] = useState([]);
  const [timeOff, setTimeOff] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeGroomerId) return undefined;
    let cancelled = false;

    async function load() {
      setStatus('loading');
      setError('');
      try {
        const supabase = requireSupabaseClient();
        const [nextProfile, nextOfferings, nextWeekly, nextTimeOff] = await Promise.all([
          loadGroomerProfile(supabase, activeGroomerId),
          loadOfferings(supabase, activeGroomerId),
          loadWeeklyHours(supabase, activeGroomerId),
          loadTimeOff(supabase, activeGroomerId),
        ]);
        if (cancelled) return;
        setProfile(nextProfile);
        setOfferings(nextOfferings);
        setWeeklyHours(nextWeekly);
        setTimeOff(nextTimeOff);
        setStatus('ready');
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError.message);
        setStatus('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeGroomerId]);

  const reloadOfferings = useCallback(async () => {
    setOfferings(await loadOfferings(requireSupabaseClient(), activeGroomerId));
  }, [activeGroomerId]);

  const reloadWeeklyHours = useCallback(async () => {
    setWeeklyHours(await loadWeeklyHours(requireSupabaseClient(), activeGroomerId));
  }, [activeGroomerId]);

  const reloadTimeOff = useCallback(async () => {
    setTimeOff(await loadTimeOff(requireSupabaseClient(), activeGroomerId));
  }, [activeGroomerId]);

  if (!verifiedMemberships.length) return null;

  const saveBusiness = async (fields) => {
    const next = await updateGroomerBusinessDetails(requireSupabaseClient(), activeGroomerId, fields);
    setProfile(next);
  };

  return (
    <section className="groomer-profile-manager">
      <div className="section-heading">
        <div>
          <h2>Manage your business</h2>
          <p>Keep your details, services, and availability up to date so customers book real slots.</p>
        </div>
        {verifiedMemberships.length > 1 ? (
          <label>
            <span>Profile</span>
            <select
              aria-label="Active groomer profile"
              value={activeGroomerId}
              onChange={(event) => setActiveGroomerId(event.target.value)}
            >
              {verifiedMemberships.map((membership) => (
                <option key={membership.groomerId} value={membership.groomerId}>
                  {membership.groomer?.name || 'Groomer profile'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {status === 'loading' ? <p className="empty-state">Loading your profile...</p> : null}
      {status === 'error' ? <p className="form-message form-message--error">{error}</p> : null}

      {status === 'ready' ? (
        <>
          <BusinessDetailsForm profile={profile} onSave={saveBusiness} />
          <OfferingsEditor
            offerings={offerings}
            onCreate={(input) =>
              createOffering(requireSupabaseClient(), activeGroomerId, input).then(reloadOfferings)
            }
            onUpdate={(id, input) =>
              updateOffering(requireSupabaseClient(), id, input).then(reloadOfferings)
            }
            onDelete={(id) => deleteOffering(requireSupabaseClient(), id).then(reloadOfferings)}
          />
          <WeeklyHoursEditor
            weeklyHours={weeklyHours}
            onCreate={(input) =>
              createWeeklyHours(requireSupabaseClient(), activeGroomerId, input, {
                existing: weeklyHours,
              }).then(reloadWeeklyHours)
            }
            onUpdate={(id, input) =>
              updateWeeklyHours(requireSupabaseClient(), id, input, { existing: weeklyHours }).then(
                reloadWeeklyHours,
              )
            }
            onDelete={(id) => deleteWeeklyHours(requireSupabaseClient(), id).then(reloadWeeklyHours)}
          />
          <TimeOffEditor
            timeOff={timeOff}
            onCreate={(input) =>
              createTimeOff(requireSupabaseClient(), activeGroomerId, input).then(reloadTimeOff)
            }
            onDelete={(id) => deleteTimeOff(requireSupabaseClient(), id).then(reloadTimeOff)}
          />
        </>
      ) : null}
    </section>
  );
}

import { useEffect, useState } from 'react';
import {
  validateBusiness,
  validateLocation,
  validateServices,
  validateAvailability,
  isValid,
} from './validation.js';
import { ServiceOfferingsEditor } from './ServiceOfferingsEditor.jsx';
import { AvailabilityEditor } from './AvailabilityEditor.jsx';
import { GbpConnectButton } from '../GbpConnectButton.jsx';
import { resolvePlace, suggestAddresses } from '../../api/geocoding.js';
import {
  createOwnedGroomer,
  refreshGroomerServices,
  saveOffering,
  saveAvailabilityBlock,
  setWaitlistOptIn,
} from '../../api/groomerOnboarding.js';

const STEPS = [
  { id: 1, title: 'Business', validate: validateBusiness },
  { id: 2, title: 'Location', validate: validateLocation },
  { id: 3, title: 'Services', validate: validateServices },
  { id: 4, title: 'Availability', validate: validateAvailability },
  { id: 5, title: 'Waitlist Extras' },
];

/**
 * Address picker for the Location step. The groomer types their street
 * address, picks a suggestion, and the coordinates are resolved behind the
 * scenes — same flow the customer search uses, instead of raw lat/lng inputs.
 */
function LocationStep({ location, onChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    // A resolved location means the input matches what we already looked up;
    // don't reopen suggestions for it.
    if (!location.address.trim() || location.lat !== null) {
      setSuggestions([]);
      return undefined;
    }

    let cancelled = false;
    // Same debounce rationale as the customer search: the geocoding
    // providers rate-limit, so wait for a typing pause.
    const timeoutId = setTimeout(() => {
      Promise.resolve(suggestAddresses(location.address))
        .then((next) => {
          if (!cancelled) {
            setSuggestions(Array.isArray(next) ? next : []);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [location.address, location.lat]);

  async function handleSelectSuggestion(suggestion) {
    if (!suggestion?.placeId) return;

    setSuggestions([]);
    setError('');

    try {
      const details = await resolvePlace(suggestion.placeId);
      if (!details) {
        setError('Could not look up that address. Try another suggestion.');
        return;
      }

      onChange({
        address: details.displayName || suggestion.displayName,
        lat: details.lat,
        lng: details.lng,
        placeId: suggestion.placeId,
      });
    } catch (caught) {
      setError(caught?.message || 'Could not look up that address.');
    }
  }

  return (
    <div className="step-content">
      <h2>Location</h2>
      <p className="step-hint">
        Search for your salon&apos;s street address so customers nearby can find you.
      </p>
      <div className="form-field">
        <label htmlFor="location-address">Address *</label>
        <input
          id="location-address"
          type="text"
          autoComplete="street-address"
          value={location.address}
          onChange={(event) =>
            onChange({
              address: event.target.value,
              lat: null,
              lng: null,
              placeId: null,
            })
          }
          className="input-field"
          required
        />
        {suggestions.length ? (
          <div className="address-suggestions" role="listbox" aria-label="Address suggestions">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.placeId || suggestion.displayName}
                role="option"
                type="button"
                onClick={() => handleSelectSuggestion(suggestion)}
              >
                {suggestion.displayName}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {location.lat !== null ? (
        <p className="form-message">Location set. Customers within range will see your salon.</p>
      ) : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </div>
  );
}

/**
 * Shown after the wizard writes everything successfully. The groomer is
 * already live and verified at this point; GBP connect is the optional
 * final boost before heading to the dashboard.
 */
function LiveStep({ groomerId, businessName, supabase, onComplete }) {
  return (
    <div className="wizard-live step-content">
      <h2>{businessName} is live!</h2>
      <p>
        Your salon is verified and visible to nearby dog owners. Connect your Google Business
        Profile to show your Google rating on your listing.
      </p>
      <GbpConnectButton supabase={supabase} groomerId={groomerId} />
      <button className="primary-button" type="button" onClick={onComplete}>
        Go to dashboard
      </button>
    </div>
  );
}

/**
 * OnboardingWizard component for groomer onboarding.
 *
 * @param {Object} props
 * @param {Object} props.supabase - Supabase client
 * @param {Function} props.onComplete - Callback when onboarding completes
 */
export function OnboardingWizard({ supabase, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdGroomerId, setCreatedGroomerId] = useState('');

  // Step 1: Business
  const [businessData, setBusinessData] = useState({
    name: '',
    salon: '',
  });

  // Step 2: Location
  const [locationData, setLocationData] = useState({
    address: '',
    lat: null,
    lng: null,
    placeId: null,
  });

  // Step 3: Services
  const [servicesData, setServicesData] = useState({
    offerings: [],
  });

  // Step 4: Availability
  const [availabilityData, setAvailabilityData] = useState({
    weeklyHours: [],
  });

  // Step 5: Waitlist Extras
  const [waitlistData, setWaitlistData] = useState({
    acceptsWaitlist: true,
  });

  const getStepData = (stepId) => {
    switch (stepId) {
      case 1:
        return businessData;
      case 2:
        return locationData;
      case 3:
        return servicesData;
      case 4:
        return availabilityData;
      case 5:
        return waitlistData;
      default:
        return null;
    }
  };

  const getStepErrors = (stepId) => {
    const stepData = getStepData(stepId);
    const step = STEPS.find((s) => s.id === stepId);

    if (stepId === 5) {
      // Waitlist step has no validation
      return {};
    }

    return step.validate(stepData);
  };

  const isStepValid = (stepId) => {
    const errors = getStepErrors(stepId);
    return isValid(errors);
  };

  const handleNext = () => {
    if (isStepValid(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinish = async () => {
    if (!isStepValid(5) || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      // create_owned_groomer atomically creates the business row plus a
      // verified owner membership, so the dashboard unlocks immediately.
      const groomer = await createOwnedGroomer(supabase, {
        name: businessData.name,
        salon: businessData.salon,
        address: locationData.address,
        lat: locationData.lat,
        lng: locationData.lng,
      });

      const groomerId = groomer.id;

      for (const offering of servicesData.offerings) {
        await saveOffering(supabase, groomerId, {
          service: offering.service,
          durationMinutes: offering.durationMinutes,
          basePriceCents: offering.basePriceCents,
        });
      }

      for (const block of availabilityData.weeklyHours) {
        await saveAvailabilityBlock(supabase, groomerId, {
          dayOfWeek: block.dayOfWeek,
          openTime: block.openTime,
          closeTime: block.closeTime,
        });
      }

      await setWaitlistOptIn(supabase, groomerId, waitlistData.acceptsWaitlist);

      // Sync the denormalized groomers.services column so the new salon
      // shows up in service-filtered customer search right away.
      await refreshGroomerServices(supabase, groomerId);

      setCreatedGroomerId(groomerId);
    } catch (caught) {
      setSubmitError(caught?.message || 'Could not finish onboarding. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (createdGroomerId) {
    return (
      <div className="onboarding-wizard">
        <LiveStep
          businessName={businessData.name}
          groomerId={createdGroomerId}
          supabase={supabase}
          onComplete={onComplete}
        />
      </div>
    );
  }

  const currentStepObj = STEPS.find((s) => s.id === currentStep);

  return (
    <div className="onboarding-wizard">
      <div className="wizard-header">
        <h1>{currentStepObj.title}</h1>
        <p className="step-indicator">
          Step {currentStep} of {STEPS.length}
        </p>
      </div>

      <div className="wizard-content">
        {currentStep === 1 && (
          <div className="step-content">
            <h2>Business Information</h2>
            <div className="form-field">
              <label htmlFor="business-name">Business Name *</label>
              <input
                id="business-name"
                type="text"
                value={businessData.name}
                onChange={(e) =>
                  setBusinessData({ ...businessData, name: e.target.value })
                }
                className="input-field"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="business-salon">Salon/Grooming Location *</label>
              <input
                id="business-salon"
                type="text"
                value={businessData.salon}
                onChange={(e) =>
                  setBusinessData({ ...businessData, salon: e.target.value })
                }
                className="input-field"
                required
              />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <LocationStep location={locationData} onChange={setLocationData} />
        )}

        {currentStep === 3 && (
          <div className="step-content">
            <h2>Services</h2>
            <ServiceOfferingsEditor
              offerings={servicesData.offerings}
              onChange={(offerings) =>
                setServicesData({ ...servicesData, offerings })
              }
            />
          </div>
        )}

        {currentStep === 4 && (
          <div className="step-content">
            <h2>Availability</h2>
            <AvailabilityEditor
              blocks={availabilityData.weeklyHours}
              onChange={(weeklyHours) =>
                setAvailabilityData({ ...availabilityData, weeklyHours })
              }
            />
          </div>
        )}

        {currentStep === 5 && (
          <div className="step-content">
            <h2>Waitlist Preferences</h2>
            <div className="form-field">
              <label htmlFor="accepts-waitlist">
                <input
                  id="accepts-waitlist"
                  type="checkbox"
                  checked={waitlistData.acceptsWaitlist}
                  onChange={(e) =>
                    setWaitlistData({
                      ...waitlistData,
                      acceptsWaitlist: e.target.checked,
                    })
                  }
                />
                Accept waitlist bookings
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="wizard-actions">
        {currentStep > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="secondary-button"
            disabled={isSubmitting}
          >
            Previous
          </button>
        )}

        {currentStep < STEPS.length && (
          <button
            type="button"
            onClick={handleNext}
            className="primary-button"
            disabled={!isStepValid(currentStep) || isSubmitting}
          >
            Next
          </button>
        )}

        {currentStep === STEPS.length && (
          <button
            type="button"
            onClick={handleFinish}
            className="primary-button"
            disabled={!isStepValid(currentStep) || isSubmitting}
          >
            {isSubmitting ? 'Finishing...' : 'Finish'}
          </button>
        )}
      </div>
      {submitError ? (
        <p className="form-message form-message--error">{submitError}</p>
      ) : null}
    </div>
  );
}

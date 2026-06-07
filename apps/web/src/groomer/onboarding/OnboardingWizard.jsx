import { useState } from 'react';
import {
  validateBusiness,
  validateLocation,
  validateServices,
  validateAvailability,
  isValid,
} from './validation.js';
import { ServiceOfferingsEditor } from './ServiceOfferingsEditor.jsx';
import { AvailabilityEditor } from './AvailabilityEditor.jsx';
import {
  createOwnedGroomer,
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
 * OnboardingWizard component for groomer onboarding.
 *
 * @param {Object} props
 * @param {Object} props.supabase - Supabase client
 * @param {Function} props.onComplete - Callback when onboarding completes
 */
export function OnboardingWizard({ supabase, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!isStepValid(5)) return;

    setIsSubmitting(true);
    try {
      // Create owned groomer
      const groomer = await createOwnedGroomer(supabase, {
        groomerId: '', // This would be set by actual groomer ID in real implementation
        bioText: null,
      });

      const groomerId = groomer.id;

      // Save service offerings
      for (const offering of servicesData.offerings) {
        await saveOffering(supabase, groomerId, {
          serviceName: offering.service,
          basePriceCents: offering.basePriceCents,
          durationMinutes: offering.durationMinutes,
        });
      }

      // Save availability blocks
      for (const block of availabilityData.weeklyHours) {
        await saveAvailabilityBlock(supabase, groomerId, {
          dayOfWeek: block.dayOfWeek,
          startTimeHHMM: block.openTime,
          endTimeHHMM: block.closeTime,
        });
      }

      // Set waitlist opt-in
      await setWaitlistOptIn(supabase, groomerId, waitlistData.acceptsWaitlist);

      // Call completion callback
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <div className="step-content">
            <h2>Location</h2>
            <div className="form-field">
              <label htmlFor="location-address">Address *</label>
              <input
                id="location-address"
                type="text"
                value={locationData.address}
                onChange={(e) =>
                  setLocationData({ ...locationData, address: e.target.value })
                }
                className="input-field"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="location-lat">Latitude</label>
              <input
                id="location-lat"
                type="number"
                step="0.0001"
                value={locationData.lat ?? ''}
                onChange={(e) =>
                  setLocationData({
                    ...locationData,
                    lat: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                className="input-field"
              />
            </div>
            <div className="form-field">
              <label htmlFor="location-lng">Longitude</label>
              <input
                id="location-lng"
                type="number"
                step="0.0001"
                value={locationData.lng ?? ''}
                onChange={(e) =>
                  setLocationData({
                    ...locationData,
                    lng: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                className="input-field"
              />
            </div>
            <div className="form-field">
              <label htmlFor="location-placeId">Place ID</label>
              <input
                id="location-placeId"
                type="text"
                value={locationData.placeId ?? ''}
                onChange={(e) =>
                  setLocationData({
                    ...locationData,
                    placeId: e.target.value || null,
                  })
                }
                className="input-field"
              />
            </div>
          </div>
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
    </div>
  );
}

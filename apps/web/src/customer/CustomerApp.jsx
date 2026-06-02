import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, LocateFixed, Star } from 'lucide-react';

import { LoginPanel } from '../auth/LoginPanel.jsx';
import { getBrowserLocation } from '../api/browserLocation.js';
import { DOG_SIZE_OPTIONS } from '../api/dogs.js';
import {
  claimGuestBookingRequest,
  PENDING_GUEST_CLAIM_STORAGE_KEY,
} from '../api/guestBooking.js';
import { fetchNearbyGroomers } from '../api/groomers.js';
import {
  geocodeAddress,
  resolvePlace,
  reverseGeocodeLocation,
  suggestAddresses,
} from '../api/geocoding.js';
import { GROOMING_SERVICES, groupGroomingServices } from '../data/services.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { BookingForm } from './BookingForm.jsx';
import { CustomerOwnershipPanel } from './CustomerOwnershipPanel.jsx';
import { GroomerCard } from './GroomerCard.jsx';

const FLOW_STEPS = new Set(['search', 'results', 'booking']);
const MANAGEMENT_SECTIONS = ['dogs', 'bookings', 'account'];

function readStepFromUrl() {
  if (typeof window === 'undefined') return 'search';
  const param = new URLSearchParams(window.location.search).get('step');
  return FLOW_STEPS.has(param) ? param : 'search';
}

const NYC_RADIUS_OPTIONS = [
  { label: '0.5 mi', meters: 805 },
  { label: '1 mi', meters: 1609 },
  { label: '3 mi', meters: 4828 },
  { label: '5 mi', meters: 8047 },
];

const OUTSIDE_NYC_RADIUS_OPTIONS = [
  { label: '1 mi', meters: 1609 },
  { label: '3 mi', meters: 4828 },
  { label: '5 mi', meters: 8047 },
  { label: '10 mi', meters: 16093 },
];

export const STARTER_LOCATION = {
  address: '',
  lat: 40.768,
  lng: -73.958,
};
export const CURRENT_LOCATION_LABEL = 'Current location';
export const INITIAL_GROOMER_LIMIT = 5;
export const DEFAULT_RADIUS_METERS = 1609;

function isNycLocation(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 40.4774 &&
    lat <= 40.9176 &&
    lng >= -74.2591 &&
    lng <= -73.7004
  );
}

function radiusOptionsForLocation(location) {
  return isNycLocation(location) ? NYC_RADIUS_OPTIONS : OUTSIDE_NYC_RADIUS_OPTIONS;
}

function formatResolvedAddress(location, fallback = CURRENT_LOCATION_LABEL) {
  return location?.displayName || location?.address || fallback;
}

function isCurrentLocationAddress(address, currentLocation) {
  return (
    Boolean(currentLocation) &&
    [
      CURRENT_LOCATION_LABEL,
      currentLocation.address,
      currentLocation.displayName,
    ].includes(address)
  );
}

function isResolvedSuggestionAddress(address, selectedSuggestion) {
  // mapGeocodingRow only surfaces { lat, lng, displayName } from Nominatim,
  // so displayName is the only field we can match against. Do not add a
  // selectedSuggestion.address fallback unless the geocoding API starts
  // returning that field.
  return Boolean(selectedSuggestion) && selectedSuggestion.displayName === address;
}

function ratingValue(groomer) {
  const parsed = Number(groomer.rating);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getFavoriteStorageKey(user) {
  return user?.id || user?.email ? `paw-status:fav-groomer:${user.id || user.email}` : '';
}

function loadFavoriteGroomerId(user) {
  const key = getFavoriteStorageKey(user);
  if (!key || typeof window === 'undefined') return '';

  return window.localStorage.getItem(key) || '';
}

function saveFavoriteGroomerId(user, groomerId) {
  const key = getFavoriteStorageKey(user);
  if (!key || typeof window === 'undefined') return;

  window.localStorage.setItem(key, groomerId);
}

function PopularNearYou({ groomers, onSelectFavorite, onStartBooking, signedIn }) {
  const popularGroomers = [...groomers]
    .sort((left, right) => {
      const ratingDiff = ratingValue(right) - ratingValue(left);
      if (ratingDiff) return ratingDiff;
      return Number(right.reviewCount || 0) - Number(left.reviewCount || 0);
    })
    .slice(0, 5);

  if (!popularGroomers.length) return null;

  return (
    <section className="popular-section" aria-label="Popular near you">
      <div className="section-heading">
        <div>
          <h2>Popular near you</h2>
          <p>Top-rated groomers from this search.</p>
        </div>
      </div>
      <div className="popular-strip">
        {popularGroomers.map((groomer) => (
          <article
            className="popular-card popular-card--clickable"
            key={groomer.id}
            role="button"
            tabIndex={0}
            aria-label={`Book ${groomer.name}`}
            onClick={() => onStartBooking?.(groomer)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onStartBooking?.(groomer);
              }
            }}
          >
            <div>
              <h3>{groomer.name}</h3>
              <p>{groomer.neighborhood || groomer.distanceLabel || 'Nearby'}</p>
            </div>
            <span className="rating">
              <Star size={14} fill="currentColor" />
              {groomer.rating || 'New'}
            </span>
            <button
              aria-label={`Save ${groomer.name} as favorite`}
              type="button"
              disabled={!signedIn}
              onClick={(event) => {
                event.stopPropagation();
                onSelectFavorite?.(groomer);
              }}
            >
              <Heart size={14} />
              Save
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CustomerApp({ initialSection = 'customer' }) {
  const { session, user, loading } = useAuth();
  const [address, setAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [selectedAddressLocation, setSelectedAddressLocation] = useState(null);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
  const [radiusOptions, setRadiusOptions] = useState(OUTSIDE_NYC_RADIUS_OPTIONS);
  const [serviceId, setServiceId] = useState(GROOMING_SERVICES[0].id);
  const [dogSize, setDogSize] = useState('');
  const [groomers, setGroomers] = useState([]);
  const [selectedGroomer, setSelectedGroomer] = useState(null);
  const [currentLocationCoords, setCurrentLocationCoords] = useState(null);
  const [hasSearchLocation, setHasSearchLocation] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [favoriteGroomerId, setFavoriteGroomerId] = useState('');
  const [guestClaimNotice, setGuestClaimNotice] = useState(null);
  const [locatingMe, setLocatingMe] = useState(false);
  const isManagementSection = MANAGEMENT_SECTIONS.includes(initialSection);
  // Bottom-nav routes (/dogs, /bookings, /account) live on the booking screen,
  // which hosts the customer's profile/management panels. On a fresh load no
  // groomer is chosen yet, so a direct ?step=booking link falls back to search
  // (in-session Back/Forward still restores booking via the popstate handler).
  const [step, setStep] = useState(() => {
    if (isManagementSection) return 'booking';
    const fromUrl = readStepFromUrl();
    return fromUrl === 'booking' ? 'search' : fromUrl;
  });
  const manualSearchStartedRef = useRef(false);
  const pendingPlaceIdRef = useRef('');

  function goToStep(nextStep) {
    setStep(nextStep);
    if (typeof window !== 'undefined') {
      const url = nextStep === 'search' ? '/' : `/?step=${nextStep}`;
      window.history.pushState({ step: nextStep }, '', url);
    }
  }
  const selectedService = useMemo(
    () => GROOMING_SERVICES.find((service) => service.id === serviceId) ?? GROOMING_SERVICES[0],
    [serviceId],
  );
  const favoriteGroomer = useMemo(
    () => groomers.find((groomer) => groomer.id === favoriteGroomerId) || null,
    [favoriteGroomerId, groomers],
  );
  const loadingResults = searching;

  useEffect(() => {
    if (!['dogs', 'bookings', 'account'].includes(initialSection)) return;

    const scrollToSection = () => {
      document.getElementById(initialSection)?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    };

    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(scrollToSection);
      return;
    }

    scrollToSection();
  }, [initialSection, loading, user]);

  useEffect(() => {
    setFavoriteGroomerId(loadFavoriteGroomerId(user));
  }, [user]);

  // Keep the screen in sync with the Back/Forward buttons. App.jsx keeps the
  // route ('customer') because the pathname stays '/'; we only read ?step=.
  useEffect(() => {
    if (isManagementSection) return undefined;
    function handlePopState() {
      setStep(readStepFromUrl());
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isManagementSection]);

  useEffect(() => {
    if (
      !address.trim() ||
      isCurrentLocationAddress(address, currentLocationCoords) ||
      isResolvedSuggestionAddress(address, selectedAddressLocation)
    ) {
      setAddressSuggestions([]);
      return undefined;
    }

    // Debounce so we are not firing Nominatim on every keystroke. Nominatim's
    // public instance rate-limits to ~1 request/sec, so an undebounced loop
    // produces throttled empty responses and looks like the suggestions are
    // broken when in reality they are just being dropped.
    //
    // Bias the suggestion ranking toward the user's current/selected location
    // when known so a search for "515 east 72nd street" from NYC does not
    // surface a Utah address before the Manhattan one.
    // Bias toward the customer's current or selected location, falling back
    // to STARTER_LOCATION (NYC) when neither exists yet. Google Places uses
    // this as a soft locationBias so out-of-area searches still work.
    const biasLocation =
      currentLocationCoords || selectedAddressLocation || STARTER_LOCATION;
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      Promise.resolve(suggestAddresses(address, { near: biasLocation }))
        .then((suggestions) => {
          if (!cancelled) {
            setAddressSuggestions(Array.isArray(suggestions) ? suggestions : []);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAddressSuggestions([]);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [address, currentLocationCoords, selectedAddressLocation]);

  useEffect(() => {
    if (!user || !session?.access_token || typeof window === 'undefined') return;

    const claimToken = window.localStorage.getItem(PENDING_GUEST_CLAIM_STORAGE_KEY);
    if (!claimToken) return;

    let cancelled = false;
    setGuestClaimNotice({ tone: 'pending', message: 'Linking your guest booking to your account…' });

    claimGuestBookingRequest({
      accessToken: session.access_token,
      claimToken,
    })
      .then(() => {
        if (cancelled) return;
        window.localStorage.removeItem(PENDING_GUEST_CLAIM_STORAGE_KEY);
        setGuestClaimNotice({
          tone: 'success',
          message: 'Your guest booking is now linked to this account.',
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setGuestClaimNotice({
          tone: 'error',
          message:
            error?.message ||
            'We could not link your guest booking. Open Bookings to try again or contact support.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadStarterGroomers() {
      setError('');

      try {
        const browserLocation = await getBrowserLocation();
        if (manualSearchStartedRef.current) return;

        if (!browserLocation) {
          if (!cancelled) {
            setAddress('');
            setCurrentLocationCoords(null);
            setHasSearchLocation(false);
            setGroomers([]);
            setSelectedGroomer(null);
          }
          return;
        }

        const refreshedLocation = await reverseGeocodeLocation(browserLocation).catch(() => null);
        const searchLocation = {
          ...browserLocation,
          address: formatResolvedAddress(refreshedLocation),
          displayName: refreshedLocation?.displayName || '',
        };
        const nextRadiusOptions = radiusOptionsForLocation(searchLocation);

        if (!cancelled) {
          // Keep the location input intentionally blank on first paint, even
          // when the browser already remembered a previous permission grant.
          // The customer asked for the field to start empty and only populate
          // when they type or click "Use my location". We still capture the
          // coords behind the scenes so nearby groomers can load without
          // requiring a re-click.
          setCurrentLocationCoords(searchLocation);
          setHasSearchLocation(true);
          setRadiusOptions(nextRadiusOptions);
          setRadiusMeters(DEFAULT_RADIUS_METERS);
        }

        const nextGroomers = await fetchNearbyGroomers({
          lat: searchLocation.lat,
          lng: searchLocation.lng,
          radiusMeters: DEFAULT_RADIUS_METERS,
          serviceId: GROOMING_SERVICES[0].id,
        });

        if (!cancelled) {
          setGroomers(nextGroomers.slice(0, INITIAL_GROOMER_LIMIT));
          setSelectedGroomer(nextGroomers[0] || null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message);
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    }

    loadStarterGroomers();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSearch(event) {
    event.preventDefault();
    manualSearchStartedRef.current = true;
    setSearching(true);
    setError('');

    try {
      if (!address.trim() && !currentLocationCoords) {
        throw new Error('Enter a location or allow browser location.');
      }

      // If the input is blank but we already captured the customer's current
      // location silently on mount, just use that — no need to make them
      // click "Use my location" first.
      const usingCurrentLocation =
        isCurrentLocationAddress(address, currentLocationCoords) ||
        (!address.trim() && Boolean(currentLocationCoords));
      const usingSelectedSuggestion =
        selectedAddressLocation?.displayName && address === selectedAddressLocation.displayName;
      const coords = usingCurrentLocation
        ? currentLocationCoords
        : usingSelectedSuggestion
          ? selectedAddressLocation
          : await geocodeAddress(address, {
              near: currentLocationCoords || selectedAddressLocation || STARTER_LOCATION,
            });
      if (!coords) {
        throw new Error('Enter a valid address or ZIP code.');
      }
      const nextRadiusOptions = radiusOptionsForLocation(coords);
      const nextRadiusMeters = nextRadiusOptions.some((option) => option.meters === radiusMeters)
        ? radiusMeters
        : DEFAULT_RADIUS_METERS;
      const nextGroomers = await fetchNearbyGroomers({
        lat: coords?.lat,
        lng: coords?.lng,
        radiusMeters: nextRadiusMeters,
        serviceId,
      });
      setAddress(formatResolvedAddress(coords, address.trim()));
      setCurrentLocationCoords(usingCurrentLocation ? currentLocationCoords : null);
      setSelectedAddressLocation(usingCurrentLocation ? null : coords);
      setAddressSuggestions([]);
      setHasSearchLocation(true);
      setRadiusOptions(nextRadiusOptions);
      setRadiusMeters(nextRadiusMeters);
      setGroomers(nextGroomers);
      setSelectedGroomer(nextGroomers[0] || null);
      goToStep('results');
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectAddressSuggestion(suggestion) {
    if (!suggestion?.placeId) return;
    // Fill the input immediately so the click feels responsive, then resolve
    // the place details (lat/lng) in the background. After details arrive we
    // overwrite the address with Google's canonical formattedAddress so the
    // input shows the verified version and the autocomplete gate has a
    // stable string to compare against.
    //
    // pendingPlaceIdRef tracks the most-recently-clicked suggestion so that
    // if the user clicks B before A's lookup returns, A's late .then() is
    // dropped and only B wins. Without it, A could silently stomp B's
    // selectedAddressLocation and produce a coords/text mismatch.
    pendingPlaceIdRef.current = suggestion.placeId;
    setAddress(formatResolvedAddress(suggestion));
    setAddressSuggestions([]);
    setCurrentLocationCoords(null);
    try {
      const details = await resolvePlace(suggestion.placeId);
      if (pendingPlaceIdRef.current !== suggestion.placeId) return;
      if (!details) {
        setError('Could not look up that address. Try another suggestion.');
        setSelectedAddressLocation(null);
        return;
      }
      const resolved = { ...details, address: details.displayName };
      setSelectedAddressLocation(resolved);
      setAddress(formatResolvedAddress(resolved));
      setError('');
    } catch (nextError) {
      if (pendingPlaceIdRef.current !== suggestion.placeId) return;
      setError(nextError.message || 'Could not look up that address.');
      setSelectedAddressLocation(null);
    }
  }

  async function handleUseMyLocation() {
    if (locatingMe) return;
    setLocatingMe(true);
    setError('');
    manualSearchStartedRef.current = true;
    try {
      const browserLocation = await getBrowserLocation();
      if (!browserLocation) {
        setError('Browser location is unavailable. Type your address or ZIP.');
        return;
      }
      const refreshedLocation = await reverseGeocodeLocation(browserLocation).catch(
        () => null,
      );
      const searchLocation = {
        ...browserLocation,
        address: formatResolvedAddress(refreshedLocation),
        displayName: refreshedLocation?.displayName || '',
      };
      const nextRadiusOptions = radiusOptionsForLocation(searchLocation);

      setAddress(formatResolvedAddress(searchLocation));
      setCurrentLocationCoords(searchLocation);
      setSelectedAddressLocation(null);
      setAddressSuggestions([]);
      setHasSearchLocation(true);
      setRadiusOptions(nextRadiusOptions);
      setRadiusMeters(DEFAULT_RADIUS_METERS);
    } catch (nextError) {
      setError(nextError.message || 'Could not read your location.');
    } finally {
      setLocatingMe(false);
    }
  }

  function handleFavoriteGroomer(groomer) {
    setFavoriteGroomerId(groomer.id);
    saveFavoriteGroomerId(user, groomer.id);
  }

  function startBookingForGroomer(nextGroomer) {
    setSelectedGroomer(nextGroomer);
    goToStep('booking');
  }

  const bookingGate = (
    <section className="booking-gate" id="bookings">
      {loading ? (
        <p>Loading session...</p>
      ) : user ? (
        <CustomerOwnershipPanel
          favoriteGroomer={favoriteGroomer}
          groomers={groomers}
          onRebookGroomer={startBookingForGroomer}
          selectedGroomer={selectedGroomer}
          selectedService={selectedService}
        />
      ) : selectedGroomer ? (
        // Only render the guest booking form after the customer has actually
        // picked a groomer from the list. Showing it on first paint makes the
        // page feel like a long wall of fields with no context for what they
        // are booking.
        //
        // LoginPanel sits ABOVE the guest form so the friction-free path
        // (sign in and have your details remembered) is the first thing the
        // customer sees. The guest form is the fallback.
        <>
          <LoginPanel
            compact
            title="Sign in and save your info"
            description="Add your email to save your booking details to an account. Skip this and book as a guest below if you'd rather not."
          />
          <BookingForm
            groomers={groomers}
            selectedDogSize={dogSize}
            selectedGroomer={selectedGroomer}
            selectedService={selectedService}
          />
        </>
      ) : (
        <p className="booking-gate__hint empty-state">
          Pick a groomer from the list below to start a booking request.
        </p>
      )}
    </section>
  );

  const searchScreen = (
    <>
      <div className="hero-panel">
        <div>
          <h1>Request a groomer in seconds</h1>
          <p>Browse public groomer listings, save your dog profile, and request a booking.</p>
        </div>
      </div>

      <form className="search-panel" onSubmit={handleSearch}>
        <label>
          <span>Location</span>
          <div className="location-input">
            <input
              aria-label="Location"
              autoComplete="street-address"
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setCurrentLocationCoords(null);
                setSelectedAddressLocation(null);
              }}
            />
            <button
              type="button"
              className="location-input__use-current"
              aria-label="Use my location"
              aria-busy={locatingMe}
              disabled={locatingMe}
              onClick={handleUseMyLocation}
              title="Use my location"
            >
              <LocateFixed size={16} aria-hidden="true" />
              <span>{locatingMe ? 'Locating…' : 'Use my location'}</span>
            </button>
          </div>
          {addressSuggestions.length ? (
            <div className="address-suggestions" role="listbox" aria-label="Address suggestions">
              {addressSuggestions.map((suggestion) => (
                <button
                  key={`${suggestion.displayName}-${suggestion.lat}-${suggestion.lng}`}
                  role="option"
                  type="button"
                  onClick={() => handleSelectAddressSuggestion(suggestion)}
                >
                  {formatResolvedAddress(suggestion)}
                </button>
              ))}
            </div>
          ) : null}
        </label>

        <fieldset>
          <legend>Radius</legend>
          <div className="segmented">
            {radiusOptions.map((option) => (
              <button
                key={option.meters}
                type="button"
                className={radiusMeters === option.meters ? 'is-active' : ''}
                onClick={() => setRadiusMeters(option.meters)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          <span>Service</span>
          <select
            aria-label="Service"
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
          >
            {groupGroomingServices().map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label>
          <span>Dog size</span>
          <select
            aria-label="Dog size"
            value={dogSize}
            onChange={(event) => setDogSize(event.target.value)}
          >
            <option value="">Any size</option>
            {DOG_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button className="primary-action" type="submit" disabled={loadingResults}>
          {loadingResults ? 'Loading groomers...' : 'Find groomers'}
        </button>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </>
  );

  const resultsScreen = (
    <>
      <button type="button" className="step-back" onClick={() => goToStep('search')}>
        ← Edit search
      </button>

      <section className="results-section">
        <div className="section-heading">
          <div>
            <h2>Nearby groomers</h2>
            <p>
              {selectedService.name} starts around ${selectedService.basePrice}
            </p>
          </div>
          <span>{groomers.length} shown</span>
        </div>
        <div className="groomer-list">
          {initialLoading ? (
            <p className="empty-state">Checking location permission...</p>
          ) : groomers.length ? (
            groomers.map((groomer) => (
              <GroomerCard
                key={groomer.id}
                groomer={groomer}
                onStartBooking={startBookingForGroomer}
                signedIn={Boolean(user)}
              />
            ))
          ) : !hasSearchLocation ? (
            <p className="empty-state">Enter a ZIP code or allow location to find groomers.</p>
          ) : (
            <p className="empty-state">No groomers found for this search.</p>
          )}
        </div>
      </section>

      <PopularNearYou
        groomers={groomers}
        onSelectFavorite={handleFavoriteGroomer}
        onStartBooking={startBookingForGroomer}
        signedIn={Boolean(user)}
      />
    </>
  );

  const bookingScreen = (
    <>
      {!isManagementSection ? (
        <button type="button" className="step-back" onClick={() => goToStep('results')}>
          ← Back to results
        </button>
      ) : null}
      {bookingGate}
    </>
  );

  return (
    <section className="customer-screen">
      {guestClaimNotice ? (
        <div
          aria-live={guestClaimNotice.tone === 'error' ? 'assertive' : 'polite'}
          className={`guest-claim-notice guest-claim-notice--${guestClaimNotice.tone}`}
          role={guestClaimNotice.tone === 'error' ? 'alert' : 'status'}
        >
          <p>{guestClaimNotice.message}</p>
          <button type="button" aria-label="Dismiss" onClick={() => setGuestClaimNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {step === 'search' ? searchScreen : null}
      {step === 'results' ? resultsScreen : null}
      {step === 'booking' ? bookingScreen : null}
    </section>
  );
}

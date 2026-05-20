import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Star } from 'lucide-react';

import { LoginPanel } from '../auth/LoginPanel.jsx';
import { getBrowserLocation } from '../api/browserLocation.js';
import { DOG_SIZE_OPTIONS } from '../api/dogs.js';
import {
  claimGuestBookingRequest,
  PENDING_GUEST_CLAIM_STORAGE_KEY,
} from '../api/guestBooking.js';
import { fetchNearbyGroomers } from '../api/groomers.js';
import { geocodeAddress, reverseGeocodeLocation, suggestAddresses } from '../api/geocoding.js';
import { GROOMING_SERVICES, groupGroomingServices } from '../data/services.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { CustomerOwnershipPanel } from './CustomerOwnershipPanel.jsx';
import { GuestBookingPanel } from './GuestBookingPanel.jsx';
import { GroomerCard } from './GroomerCard.jsx';

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

function PopularNearYou({ groomers, onSelectFavorite, signedIn }) {
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
          <article className="popular-card" key={groomer.id}>
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
              onClick={() => onSelectFavorite?.(groomer)}
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
  const manualSearchStartedRef = useRef(false);
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

  useEffect(() => {
    if (!address.trim() || isCurrentLocationAddress(address, currentLocationCoords)) {
      setAddressSuggestions([]);
      return undefined;
    }

    let cancelled = false;

    Promise.resolve(suggestAddresses(address))
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

    return () => {
      cancelled = true;
    };
  }, [address, currentLocationCoords]);

  useEffect(() => {
    if (!user || !session?.access_token || typeof window === 'undefined') return;

    const claimToken = window.localStorage.getItem(PENDING_GUEST_CLAIM_STORAGE_KEY);
    if (!claimToken) return;

    let cancelled = false;

    claimGuestBookingRequest({
      accessToken: session.access_token,
      claimToken,
    })
      .then(() => {
        if (!cancelled) {
          window.localStorage.removeItem(PENDING_GUEST_CLAIM_STORAGE_KEY);
        }
      })
      .catch(() => {});

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
          setAddress(formatResolvedAddress(searchLocation));
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

      const usingCurrentLocation = isCurrentLocationAddress(address, currentLocationCoords);
      const usingSelectedSuggestion =
        selectedAddressLocation?.displayName && address === selectedAddressLocation.displayName;
      const coords = usingCurrentLocation
        ? currentLocationCoords
        : usingSelectedSuggestion
          ? selectedAddressLocation
          : await geocodeAddress(address);
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
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSearching(false);
    }
  }

  function handleSelectAddressSuggestion(suggestion) {
    setAddress(formatResolvedAddress(suggestion));
    setSelectedAddressLocation(suggestion);
    setCurrentLocationCoords(null);
    setAddressSuggestions([]);
  }

  function handleFavoriteGroomer(groomer) {
    setFavoriteGroomerId(groomer.id);
    saveFavoriteGroomerId(user, groomer.id);
  }

  function startBookingForGroomer(nextGroomer) {
    setSelectedGroomer(nextGroomer);
    window.history.replaceState(null, '', '/bookings');
    window.dispatchEvent(new Event('popstate'));
    document.getElementById('bookings')?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    });
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
      ) : (
        <>
          <GuestBookingPanel
            groomers={groomers}
            selectedDogSize={dogSize}
            selectedGroomer={selectedGroomer}
            selectedService={selectedService}
          />
          <LoginPanel compact />
        </>
      )}
    </section>
  );
  const showFocusedBookingGate = ['dogs', 'bookings', 'account'].includes(initialSection);

  return (
    <section className="customer-screen">
      <div className="hero-panel">
        <div>
          <h1>Request a groomer in seconds</h1>
          <p>Browse public groomer listings, save your dog profile, and request a booking.</p>
        </div>
      </div>

      <form className="search-panel" onSubmit={handleSearch}>
        <label>
          <span>Location</span>
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

      {showFocusedBookingGate ? bookingGate : null}

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

      {showFocusedBookingGate ? null : bookingGate}

      <PopularNearYou
        groomers={groomers}
        onSelectFavorite={handleFavoriteGroomer}
        signedIn={Boolean(user)}
      />
    </section>
  );
}

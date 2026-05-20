const DEFAULT_TIMEOUT_MS = 5000;
const LOCATION_OPTIONS = {
  enableHighAccuracy: false,
  maximumAge: 300000,
};

export function getBrowserLocation({
  geolocation = globalThis.navigator?.geolocation,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!geolocation?.getCurrentPosition) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;

    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    }

    const timeout = setTimeout(() => finish(null), timeoutMs);

    geolocation.getCurrentPosition(
      (position) => {
        const lat = position?.coords?.latitude;
        const lng = position?.coords?.longitude;

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          finish({ lat, lng });
          return;
        }

        finish(null);
      },
      () => finish(null),
      {
        ...LOCATION_OPTIONS,
        timeout: timeoutMs,
      },
    );
  });
}

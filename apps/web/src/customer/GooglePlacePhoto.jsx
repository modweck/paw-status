import { useEffect, useState } from 'react';

const emptyState = {
  authorAttributions: [],
  photoUri: '',
  status: 'idle',
};

function PhotoAttribution({ authorAttributions }) {
  const attribution = authorAttributions.find((item) => item.displayName || item.uri);

  if (attribution?.displayName && attribution?.uri) {
    return (
      <a className="photo-attribution" href={attribution.uri} target="_blank" rel="noreferrer">
        Photo: {attribution.displayName}
      </a>
    );
  }

  if (attribution?.displayName) {
    return <span className="photo-attribution">Photo: {attribution.displayName}</span>;
  }

  return (
    <span className="photo-attribution" translate="no">
      Google Maps
    </span>
  );
}

export function GooglePlacePhoto({ placeId }) {
  const [photo, setPhoto] = useState(emptyState);

  useEffect(() => {
    if (!placeId) {
      setPhoto(emptyState);
      return undefined;
    }

    const controller = new AbortController();
    const photoEndpoint = new URL('/api/groomer-photo', window.location.origin);
    photoEndpoint.searchParams.set('placeId', placeId);
    photoEndpoint.searchParams.set('maxWidth', '600');

    setPhoto({ ...emptyState, status: 'loading' });

    async function loadPhoto() {
      const response = await fetch(photoEndpoint.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (response.status === 404) {
        setPhoto({ ...emptyState, status: 'empty' });
        return;
      }

      if (!response.ok) {
        throw new Error('Could not load groomer photo.');
      }

      const data = await response.json();
      setPhoto({
        authorAttributions: Array.isArray(data.authorAttributions) ? data.authorAttributions : [],
        photoUri: data.photoUri || '',
        status: data.photoUri ? 'loaded' : 'empty',
      });
    }

    loadPhoto().catch((error) => {
      if (error.name !== 'AbortError') {
        setPhoto({ ...emptyState, status: 'error' });
      }
    });

    return () => controller.abort();
  }, [placeId]);

  if (!photo.photoUri) {
    return <span aria-hidden="true">✂️</span>;
  }

  return (
    <>
      <img src={photo.photoUri} alt="" loading="lazy" />
      <PhotoAttribution authorAttributions={photo.authorAttributions} />
    </>
  );
}

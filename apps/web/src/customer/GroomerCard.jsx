import { ExternalLink, Star } from 'lucide-react';

import { GooglePlacePhoto } from './GooglePlacePhoto.jsx';

export function GroomerCard({ groomer, onStartBooking, signedIn }) {
  return (
    <article className="groomer-card">
      <div className="groomer-card__media">
        {groomer.photoUrl ? (
          <img src={groomer.photoUrl} alt="" loading="lazy" />
        ) : groomer.googlePlaceId ? (
          <GooglePlacePhoto placeId={groomer.googlePlaceId} />
        ) : (
          <span aria-hidden="true">✂️</span>
        )}
      </div>
      <div className="groomer-card__body">
        <div className="groomer-card__title-row">
          <h3>{groomer.name}</h3>
          <span className="rating">
            <Star size={14} fill="currentColor" />
            {groomer.rating}
          </span>
        </div>
        <p>{groomer.neighborhood}</p>
        <p className="muted">
          {groomer.distanceLabel || 'Distance TBD'} · next: {groomer.nextAvailable}
        </p>
        <div className="groomer-card__actions">
          <a href={groomer.website || '#'} target="_blank" rel="noreferrer" aria-disabled={!groomer.website}>
            Website <ExternalLink size={14} />
          </a>
          <button type="button" onClick={() => onStartBooking?.(groomer)}>
            Book
          </button>
        </div>
      </div>
    </article>
  );
}

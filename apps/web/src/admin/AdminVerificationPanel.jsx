import {
  ClipboardCheck,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';

import {
  loadPendingAdminAccessRequests,
  loadPendingGroomerMembershipClaims,
  reviewAdminAccessRequest,
  reviewGroomerMembershipClaim,
} from '../api/adminVerification.js';
import { LoginPanel } from '../auth/LoginPanel.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

function asArray(payload, keys) {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

function getClaimTitle(claim) {
  return claim.groomer?.name || claim.groomerName || claim.profileName || 'Groomer profile claim';
}

function getClaimSubtitle(claim) {
  return (
    claim.groomer?.address ||
    claim.groomer?.website ||
    claim.account?.email ||
    claim.requesterEmail ||
    'Pending review'
  );
}

function getAdminRequestTitle(request) {
  return request.email || request.userEmail || request.name || 'Admin access request';
}

function getAdminRequestSubtitle(request) {
  return request.reason || request.note || request.createdAt || request.created_at || 'Pending review';
}

function AdminSignIn() {
  return (
    <section className="staff-screen admin-screen">
      <section className="signed-in-card groomer-panel">
        <div className="login-panel__icon">
          <ShieldAlert size={18} />
        </div>
        <div>
          <h2>Admin sign in</h2>
          <p>Use a PawStatus admin account before reviewing groomer claims or admin access.</p>
        </div>
        <LoginPanel
          compact
          title="Admin login"
          description="Sign in with a trusted PawStatus admin email. Access still needs server-side admin authorization."
        />
      </section>
    </section>
  );
}

function AdminMetric({ icon: Icon, label, value }) {
  return (
    <article className="admin-metric">
      <div className="login-panel__icon">
        <Icon size={18} />
      </div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function ReviewSection({
  emptyText,
  error,
  items,
  loading,
  onLoad,
  onReview,
  reviewLabels,
  subtitleFor,
  title,
  titleFor,
}) {
  return (
    <section className="signed-in-card groomer-panel">
      <div className="admin-section-heading">
        <div>
          <h2>{title}</h2>
          <p>{items.length ? `${items.length} pending` : emptyText}</p>
        </div>
        <button className="admin-refresh-button" disabled={loading} onClick={onLoad} type="button">
          <RotateCw size={14} />
          {loading ? 'Loading' : 'Load'}
        </button>
      </div>

      {items.length ? (
        <div className="membership-list">
          {items.map((item) => (
            <article className="membership-item admin-review-item" key={item.id}>
              <div>
                <h3>{titleFor(item)}</h3>
                <p>{subtitleFor(item)}</p>
              </div>
              <div className="admin-review-actions">
                <button type="button" onClick={() => onReview(item.id, reviewLabels.acceptValue)}>
                  {reviewLabels.acceptLabel}
                </button>
                <button type="button" onClick={() => onReview(item.id, reviewLabels.rejectValue)}>
                  {reviewLabels.rejectLabel}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </section>
  );
}

export function AdminVerificationPanel() {
  const { loading, session, user } = useAuth();
  const [claimStatus, setClaimStatus] = useState('idle');
  const [adminAccessStatus, setAdminAccessStatus] = useState('idle');
  const [claims, setClaims] = useState([]);
  const [adminAccessRequests, setAdminAccessRequests] = useState([]);
  const [claimError, setClaimError] = useState('');
  const [adminAccessError, setAdminAccessError] = useState('');

  async function loadClaims() {
    setClaimStatus('loading');
    setClaimError('');

    try {
      const payload = await loadPendingGroomerMembershipClaims({
        accessToken: session?.access_token || '',
      });
      setClaims(asArray(payload, ['claims', 'memberships', 'data']));
      setClaimStatus('ready');
    } catch (error) {
      setClaimError(error.message);
      setClaimStatus('idle');
    }
  }

  async function loadAdminAccess() {
    setAdminAccessStatus('loading');
    setAdminAccessError('');

    try {
      const payload = await loadPendingAdminAccessRequests({
        accessToken: session?.access_token || '',
      });
      setAdminAccessRequests(asArray(payload, ['requests', 'adminAccessRequests', 'data']));
      setAdminAccessStatus('ready');
    } catch (error) {
      setAdminAccessError(error.message);
      setAdminAccessStatus('idle');
    }
  }

  async function handleClaimReview(membershipId, decision) {
    setClaimError('');

    try {
      await reviewGroomerMembershipClaim(membershipId, decision, {
        accessToken: session?.access_token || '',
      });
      setClaims((current) => current.filter((claim) => claim.id !== membershipId));
    } catch (error) {
      setClaimError(error.message);
    }
  }

  async function handleAdminAccessReview(requestId, decision) {
    setAdminAccessError('');

    try {
      await reviewAdminAccessRequest(requestId, decision, {
        accessToken: session?.access_token || '',
      });
      setAdminAccessRequests((current) => current.filter((request) => request.id !== requestId));
    } catch (error) {
      setAdminAccessError(error.message);
    }
  }

  if (loading) {
    return (
      <section className="staff-screen admin-screen">
        <p className="empty-state">Loading admin session...</p>
      </section>
    );
  }

  if (!user) {
    return <AdminSignIn />;
  }

  return (
    <section className="staff-screen admin-screen">
      <div className="section-heading">
        <div>
          <h2>Admin dashboard</h2>
          <p>{user.email}</p>
        </div>
      </div>

      <section className="admin-dashboard-grid" aria-label="Admin overview">
        <AdminMetric icon={ClipboardCheck} label="Groomer claims loaded" value={claims.length} />
        <AdminMetric icon={UsersRound} label="Admin requests loaded" value={adminAccessRequests.length} />
        <AdminMetric icon={ShieldCheck} label="Backend authorization" value="TODO" />
      </section>

      <ReviewSection
        emptyText="Load pending groomer claims to approve or reject verified access."
        error={claimError}
        items={claims}
        loading={claimStatus === 'loading'}
        onLoad={loadClaims}
        onReview={handleClaimReview}
        reviewLabels={{
          acceptLabel: 'Approve',
          acceptValue: 'verify',
          rejectLabel: 'Deny',
          rejectValue: 'reject',
        }}
        subtitleFor={getClaimSubtitle}
        title="Groomer claim review"
        titleFor={getClaimTitle}
      />

      <ReviewSection
        emptyText="Load pending admin access requests after the bootstrap admin model exists."
        error={adminAccessError}
        items={adminAccessRequests}
        loading={adminAccessStatus === 'loading'}
        onLoad={loadAdminAccess}
        onReview={handleAdminAccessReview}
        reviewLabels={{
          acceptLabel: 'Approve',
          acceptValue: 'approve',
          rejectLabel: 'Deny',
          rejectValue: 'deny',
        }}
        subtitleFor={getAdminRequestSubtitle}
        title="Admin access review"
        titleFor={getAdminRequestTitle}
      />

      <section className="signed-in-card groomer-panel">
        <div className="login-panel__icon">
          <UserCog size={18} />
        </div>
        <div>
          <h2>Production TODO</h2>
          <p>
            The first admin must be bootstrapped from a trusted server-side source before this page
            can safely approve other admins.
          </p>
        </div>
        <div className="metadata-list">
          <div className="metadata-row">
            <div>
              <strong>Admin authorization source</strong>
              <span>Use app metadata, a server-owned table, or an environment allowlist.</span>
            </div>
            <span>required</span>
          </div>
          <div className="metadata-row">
            <div>
              <strong>Audit log</strong>
              <span>Record reviewer, decision, previous status, next status, note, and timestamp.</span>
            </div>
            <span>required</span>
          </div>
        </div>
      </section>
    </section>
  );
}

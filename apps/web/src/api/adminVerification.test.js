import { describe, expect, it, vi } from 'vitest';

import {
  loadPendingGroomerMembershipClaims,
  reviewAdminAccessRequest,
  reviewGroomerMembershipClaim,
} from './adminVerification.js';

function okResponse(payload = {}) {
  return {
    json: async () => payload,
    ok: true,
  };
}

describe('admin verification api', () => {
  it('sends bearer auth when loading groomer membership claims', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(okResponse({ claims: [] }));

    await loadPendingGroomerMembershipClaims({
      accessToken: 'admin-token',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/groomer-membership-claims',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer admin-token',
        }),
      }),
    );
  });

  it('posts groomer claim review decisions with bearer auth', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(okResponse({ claim: { id: 'membership-1' } }));

    await reviewGroomerMembershipClaim('membership-1', 'verify', {
      accessToken: 'admin-token',
      fetcher,
      reviewerNote: 'Matches business owner.',
    });

    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/groomer-membership-claims/membership-1/review',
      expect.objectContaining({
        body: JSON.stringify({
          decision: 'verify',
          reviewerNote: 'Matches business owner.',
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer admin-token',
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }),
    );
  });

  it('validates admin access review decisions before posting', async () => {
    const fetcher = vi.fn();

    await expect(
      reviewAdminAccessRequest('admin-request-1', 'verify', {
        fetcher,
      }),
    ).rejects.toThrow('Choose approve or deny.');

    expect(fetcher).not.toHaveBeenCalled();
  });
});

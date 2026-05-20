import { describe, expect, it, vi } from 'vitest';

import {
  createGroomerAccountForVerifiedUser,
  loadGroomerWorkspaceForVerifiedUser,
  mapAppointmentRequestForGroomerRow,
  mapGroomerAccountRow,
  requestGroomerMembership,
  searchClaimableGroomers,
  updateOwnedAppointmentRequestStatus,
} from './groomerAccounts.js';

const user = {
  id: 'auth-groomer-1',
  email: 'owner@pawhouse.example',
};

const accountRow = {
  id: 'groomer-account-1',
  auth_user_id: user.id,
  name: 'Alex Groomer',
  email: user.email,
  phone: '+12125551212',
  created_at: '2026-05-17T00:00:00.000Z',
};

const membershipRow = {
  id: 'membership-1',
  groomer_account_id: accountRow.id,
  groomer_id: 'groomer-1',
  role: 'owner',
  status: 'verified',
  created_at: '2026-05-17T00:00:00.000Z',
  groomers: {
    id: 'groomer-1',
    name: 'Paw House',
    salon: 'Paw House',
    address: '515 E 72nd St',
    phone: '+12125550000',
    website: 'https://pawhouse.example/book',
  },
};

const requestRow = {
  id: 'request-1',
  customer_id: 'customer-1',
  dog_id: 'dog-1',
  groomer_id: 'groomer-1',
  service: 'full-groom',
  preferred_windows: ['weekday-evening'],
  customer_notes: 'Text before confirming.',
  status: 'requested',
  external_booking_url: null,
  created_at: '2026-05-17T00:00:00.000Z',
  updated_at: '2026-05-17T00:00:00.000Z',
  dogs: {
    id: 'dog-1',
    name: 'Mochi',
    breed: 'Shih Tzu',
    size: 'small',
    notes: 'Nervous with dryers.',
    customers: {
      id: 'customer-1',
      name: 'Jamie',
      email: 'jamie@example.com',
      phone: '+12125551111',
    },
  },
  groomers: membershipRow.groomers,
};

function createChainClient(tableResponses) {
  const spies = {
    eq: vi.fn(),
    from: vi.fn(),
    ilike: vi.fn(),
    in: vi.fn(),
    insert: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    update: vi.fn(),
  };

  function makeBuilder(tableName) {
    const response = tableResponses[tableName] || {};
    const builder = {
      eq(column, value) {
        spies.eq(column, value);
        return builder;
      },
      in(column, value) {
        spies.in(column, value);
        return builder;
      },
      insert(row) {
        spies.insert(row);
        return builder;
      },
      ilike(column, value) {
        spies.ilike(column, value);
        return builder;
      },
      limit(value) {
        spies.limit(value);
        return Promise.resolve(response.limit);
      },
      maybeSingle() {
        spies.maybeSingle();
        return Promise.resolve(response.maybeSingle);
      },
      order(column, options) {
        spies.order(column, options);
        return Promise.resolve(response.order);
      },
      select(fields) {
        spies.select(fields);
        return builder;
      },
      single() {
        spies.single();
        return Promise.resolve(response.single);
      },
      update(row) {
        spies.update(row);
        return builder;
      },
    };

    return builder;
  }

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from(tableName) {
      spies.from(tableName);
      return makeBuilder(tableName);
    },
    spies,
  };
}

describe('groomer account api', () => {
  it('maps groomer account rows without trusting user metadata', () => {
    expect(mapGroomerAccountRow(accountRow)).toEqual({
      id: accountRow.id,
      authUserId: user.id,
      name: 'Alex Groomer',
      email: user.email,
      phone: '+12125551212',
      createdAt: '2026-05-17T00:00:00.000Z',
    });
  });

  it('maps owned appointment request rows into booking packets', () => {
    expect(mapAppointmentRequestForGroomerRow(requestRow)).toMatchObject({
      id: 'request-1',
      groomerId: 'groomer-1',
      status: 'requested',
      dog: {
        id: 'dog-1',
        name: 'Mochi',
        breed: 'Shih Tzu',
      },
      customer: {
        id: 'customer-1',
        name: 'Jamie',
        email: 'jamie@example.com',
        phone: '+12125551111',
      },
      groomer: {
        id: 'groomer-1',
        name: 'Paw House',
      },
    });
  });

  it('creates a groomer account tied to the verified Supabase auth user', async () => {
    const client = createChainClient({
      groomer_accounts: {
        single: { data: accountRow, error: null },
      },
    });

    const account = await createGroomerAccountForVerifiedUser(client, {
      name: ' Alex Groomer ',
      phone: ' +12125551212 ',
    });

    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(client.spies.from).toHaveBeenCalledWith('groomer_accounts');
    expect(client.spies.insert).toHaveBeenCalledWith({
      auth_user_id: user.id,
      email: user.email,
      name: 'Alex Groomer',
      phone: '+12125551212',
    });
    expect(account.name).toBe('Alex Groomer');
  });

  it('loads the verified groomer workspace without exposing other salons', async () => {
    const client = createChainClient({
      groomer_accounts: {
        maybeSingle: { data: accountRow, error: null },
      },
      groomer_memberships: {
        order: { data: [membershipRow], error: null },
      },
      appointment_requests: {
        order: { data: [requestRow], error: null },
      },
      booking_channels: {
        order: { data: [], error: null },
      },
      calendar_connections: {
        order: { data: [], error: null },
      },
    });

    const workspace = await loadGroomerWorkspaceForVerifiedUser(client);

    expect(client.spies.eq).toHaveBeenCalledWith('auth_user_id', user.id);
    expect(client.spies.in).toHaveBeenCalledWith('groomer_id', ['groomer-1']);
    expect(workspace.account.id).toBe(accountRow.id);
    expect(workspace.verifiedMemberships).toHaveLength(1);
    expect(workspace.requests[0].customer.email).toBe('jamie@example.com');
  });

  it('can load onboarding-only workspace without request handling packets', async () => {
    const client = createChainClient({
      groomer_accounts: {
        maybeSingle: { data: accountRow, error: null },
      },
      groomer_memberships: {
        order: { data: [membershipRow], error: null },
      },
    });

    const workspace = await loadGroomerWorkspaceForVerifiedUser(client, {
      includeRequestHandling: false,
    });

    expect(client.spies.from).toHaveBeenCalledWith('groomer_accounts');
    expect(client.spies.from).toHaveBeenCalledWith('groomer_memberships');
    expect(client.spies.from).not.toHaveBeenCalledWith('appointment_requests');
    expect(client.spies.from).not.toHaveBeenCalledWith('booking_channels');
    expect(workspace.requests).toEqual([]);
    expect(workspace.verifiedMemberships).toHaveLength(1);
  });

  it('requests a pending membership claim for an owned groomer account', async () => {
    const client = createChainClient({
      groomer_memberships: {
        single: { data: { ...membershipRow, status: 'pending' }, error: null },
      },
    });

    const membership = await requestGroomerMembership(client, { id: accountRow.id }, 'groomer-1');

    expect(client.spies.insert).toHaveBeenCalledWith({
      groomer_account_id: accountRow.id,
      groomer_id: 'groomer-1',
      role: 'owner',
      status: 'pending',
    });
    expect(membership.status).toBe('pending');
  });

  it('searches public groomer profiles before creating a claim', async () => {
    const client = createChainClient({
      groomers: {
        limit: {
          data: [
            {
              id: 'groomer-1',
              name: 'Paw House',
              salon: 'Paw House',
              address: '515 E 72nd St',
              phone: '+12125550000',
              website: 'https://pawhouse.example/book',
            },
          ],
          error: null,
        },
      },
    });

    const results = await searchClaimableGroomers(client, ' Paw ');

    expect(client.spies.from).toHaveBeenCalledWith('groomers');
    expect(client.spies.ilike).toHaveBeenCalledWith('name', '%Paw%');
    expect(client.spies.limit).toHaveBeenCalledWith(8);
    expect(results[0]).toMatchObject({
      id: 'groomer-1',
      name: 'Paw House',
      website: 'https://pawhouse.example/book',
    });
  });

  it('limits groomer request updates to the allowed handoff statuses', async () => {
    const client = createChainClient({
      appointment_requests: {
        single: { data: { ...requestRow, status: 'needs_customer_action' }, error: null },
      },
    });

    const updated = await updateOwnedAppointmentRequestStatus(
      client,
      { id: 'request-1' },
      'needs_customer_action',
    );

    expect(client.spies.update).toHaveBeenCalledWith({
      status: 'needs_customer_action',
    });
    expect(client.spies.eq).toHaveBeenCalledWith('id', 'request-1');
    expect(updated.status).toBe('needs_customer_action');

    await expect(updateOwnedAppointmentRequestStatus(client, { id: 'request-1' }, 'confirmed')).rejects.toThrow(
      'Choose a valid request status.',
    );
  });
});

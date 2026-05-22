import { getVerifiedAuthUser } from './customers.js';

const GROOMER_ACCOUNT_FIELDS = 'id, auth_user_id, name, email, phone, created_at';
const GROOMER_MEMBERSHIP_FIELDS = `
  id,
  groomer_account_id,
  groomer_id,
  role,
  status,
  created_at,
  groomers:groomer_id (
    id,
    name,
    salon,
    address,
    phone,
    website
  )
`;
const OWNED_REQUEST_FIELDS = `
  id,
  customer_id,
  dog_id,
  groomer_id,
  service,
  preferred_windows,
  customer_notes,
  status,
  external_booking_url,
  created_at,
  updated_at,
  dogs:dog_id (
    id,
    name,
    breed,
    size,
    notes,
    customers:customer_id (
      id,
      name,
      email,
      phone
    )
  ),
  groomers:groomer_id (
    id,
    name,
    salon,
    address,
    phone,
    website
  )
`;
const BOOKING_CHANNEL_FIELDS =
  'id, groomer_id, provider, label, url, phone, email, priority, is_active, created_at';
const CALENDAR_CONNECTION_FIELDS =
  'id, groomer_account_id, groomer_id, provider, status, external_account_label, created_at';
const CLAIMABLE_GROOMER_FIELDS = 'id, name, salon, address, phone, website';

export const GROOMER_REQUEST_STATUS_OPTIONS = [
  { value: 'viewed', label: 'Viewed' },
  { value: 'needs_customer_action', label: 'Needs customer action' },
  { value: 'declined', label: 'Declined' },
  { value: 'external_handoff', label: 'Sent to booking link' },
];

const GROOMER_REQUEST_STATUS_VALUES = new Set(
  GROOMER_REQUEST_STATUS_OPTIONS.map((option) => option.value),
);

function cleanOptionalText(value) {
  const cleaned = String(value || '').trim();
  return cleaned || null;
}

function requireName(value) {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) {
    throw new Error('Name is required.');
  }

  return cleaned;
}

function requireAccountId(account) {
  if (!account?.id) {
    throw new Error('Groomer account required.');
  }

  return account.id;
}

function requireGroomerId(groomerId) {
  const cleaned = cleanOptionalText(groomerId);
  if (!cleaned) {
    throw new Error('Choose a groomer profile.');
  }

  return cleaned;
}

function requireRequestId(request) {
  if (!request?.id) {
    throw new Error('Choose a booking request.');
  }

  return request.id;
}

function normalizeRequestStatus(status) {
  const cleaned = String(status || '').trim();
  if (!GROOMER_REQUEST_STATUS_VALUES.has(cleaned)) {
    throw new Error('Choose a valid request status.');
  }

  return cleaned;
}

export function mapGroomerAccountRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    authUserId: row.auth_user_id,
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    createdAt: row.created_at || '',
  };
}

export function mapGroomerMembershipRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    groomerAccountId: row.groomer_account_id,
    groomerId: row.groomer_id,
    role: row.role || '',
    status: row.status || '',
    createdAt: row.created_at || '',
    groomer: row.groomers
      ? {
          id: row.groomers.id,
          name: row.groomers.name || '',
          salon: row.groomers.salon || '',
          address: row.groomers.address || '',
          phone: row.groomers.phone || '',
          website: row.groomers.website || '',
        }
      : null,
  };
}

export function mapClaimableGroomerRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name || '',
    salon: row.salon || '',
    address: row.address || '',
    phone: row.phone || '',
    website: row.website || '',
  };
}

export function mapBookingChannelRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    groomerId: row.groomer_id,
    provider: row.provider || '',
    label: row.label || '',
    url: row.url || '',
    phone: row.phone || '',
    email: row.email || '',
    priority: Number.isFinite(row.priority) ? row.priority : 100,
    isActive: row.is_active !== false,
    createdAt: row.created_at || '',
  };
}

export function mapCalendarConnectionRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    groomerAccountId: row.groomer_account_id,
    groomerId: row.groomer_id,
    provider: row.provider || '',
    status: row.status || '',
    externalAccountLabel: row.external_account_label || '',
    createdAt: row.created_at || '',
  };
}

export function mapAppointmentRequestForGroomerRow(row) {
  if (!row) return null;

  const dog = row.dogs || {};
  const customer = dog.customers || {};
  const groomer = row.groomers || {};

  return {
    id: row.id,
    customerId: row.customer_id,
    dogId: row.dog_id,
    groomerId: row.groomer_id,
    service: row.service || '',
    preferredWindows: Array.isArray(row.preferred_windows) ? row.preferred_windows : [],
    customerNotes: row.customer_notes || '',
    status: row.status || '',
    externalBookingUrl: row.external_booking_url || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    dog: {
      id: dog.id || '',
      name: dog.name || '',
      breed: dog.breed || '',
      size: dog.size || '',
      notes: dog.notes || '',
    },
    customer: {
      id: customer.id || '',
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
    },
    groomer: {
      id: groomer.id || '',
      name: groomer.name || '',
      salon: groomer.salon || '',
      address: groomer.address || '',
      phone: groomer.phone || '',
      website: groomer.website || '',
    },
  };
}

export async function loadGroomerAccountForVerifiedUser(supabase) {
  const user = await getVerifiedAuthUser(supabase);
  const { data, error } = await supabase
    .from('groomer_accounts')
    .select(GROOMER_ACCOUNT_FIELDS)
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    user,
    account: mapGroomerAccountRow(data),
  };
}

export async function createGroomerAccountForVerifiedUser(supabase, profileInput = {}) {
  const user = await getVerifiedAuthUser(supabase);
  const row = {
    auth_user_id: user.id,
    email: cleanOptionalText(profileInput.email) || cleanOptionalText(user.email),
    name: requireName(profileInput.name),
    phone: cleanOptionalText(profileInput.phone),
  };

  const { data, error } = await supabase
    .from('groomer_accounts')
    .insert(row)
    .select(GROOMER_ACCOUNT_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapGroomerAccountRow(data);
}

export async function loadGroomerMemberships(supabase, account) {
  const accountId = requireAccountId(account);
  const { data, error } = await supabase
    .from('groomer_memberships')
    .select(GROOMER_MEMBERSHIP_FIELDS)
    .eq('groomer_account_id', accountId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapGroomerMembershipRow);
}

export async function requestGroomerMembership(supabase, account, groomerId) {
  const row = {
    groomer_account_id: requireAccountId(account),
    groomer_id: requireGroomerId(groomerId),
    role: 'owner',
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('groomer_memberships')
    .insert(row)
    .select(GROOMER_MEMBERSHIP_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapGroomerMembershipRow(data);
}

export async function searchClaimableGroomers(supabase, query) {
  const cleaned = cleanOptionalText(query);
  if (!cleaned || cleaned.length < 2) {
    return [];
  }

  const { data, error } = await supabase
    .from('groomers')
    .select(CLAIMABLE_GROOMER_FIELDS)
    .ilike('name', `%${cleaned}%`)
    .limit(8);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapClaimableGroomerRow);
}

export async function loadOwnedAppointmentRequests(supabase, memberships) {
  const groomerIds = memberships
    .filter((membership) => membership.status === 'verified' && membership.groomerId)
    .map((membership) => membership.groomerId);

  if (!groomerIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from('appointment_requests')
    .select(OWNED_REQUEST_FIELDS)
    .in('groomer_id', groomerIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapAppointmentRequestForGroomerRow);
}

export async function loadBookingChannelsForMemberships(supabase, memberships) {
  const groomerIds = memberships
    .filter((membership) => membership.status === 'verified' && membership.groomerId)
    .map((membership) => membership.groomerId);

  if (!groomerIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from('booking_channels')
    .select(BOOKING_CHANNEL_FIELDS)
    .in('groomer_id', groomerIds)
    .order('priority', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapBookingChannelRow);
}

export async function loadCalendarConnectionsForAccount(supabase, account) {
  const accountId = requireAccountId(account);
  const { data, error } = await supabase
    .from('calendar_connections')
    .select(CALENDAR_CONNECTION_FIELDS)
    .eq('groomer_account_id', accountId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapCalendarConnectionRow);
}

export async function loadGroomerWorkspaceForVerifiedUser(
  supabase,
  { includeRequestHandling = true } = {},
) {
  const { user, account } = await loadGroomerAccountForVerifiedUser(supabase);

  if (!account) {
    return {
      user,
      account: null,
      memberships: [],
      verifiedMemberships: [],
      requests: [],
      bookingChannels: [],
      calendarConnections: [],
    };
  }

  const memberships = await loadGroomerMemberships(supabase, account);
  const verifiedMemberships = memberships.filter((membership) => membership.status === 'verified');
  if (!includeRequestHandling) {
    return {
      user,
      account,
      memberships,
      verifiedMemberships,
      requests: [],
      bookingChannels: [],
      calendarConnections: [],
    };
  }

  const [requests, bookingChannels, calendarConnections] = await Promise.all([
    loadOwnedAppointmentRequests(supabase, verifiedMemberships),
    loadBookingChannelsForMemberships(supabase, verifiedMemberships),
    loadCalendarConnectionsForAccount(supabase, account),
  ]);

  return {
    user,
    account,
    memberships,
    verifiedMemberships,
    requests,
    bookingChannels,
    calendarConnections,
  };
}

export async function updateOwnedAppointmentRequestStatus(
  supabase,
  request,
  status,
  options = {},
) {
  const row = {
    status: normalizeRequestStatus(status),
  };
  const externalBookingUrl = cleanOptionalText(options.externalBookingUrl);

  if (row.status === 'external_handoff' && externalBookingUrl) {
    row.external_booking_url = externalBookingUrl;
  }

  const { data, error } = await supabase
    .from('appointment_requests')
    .update(row)
    .eq('id', requireRequestId(request))
    .select(OWNED_REQUEST_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapAppointmentRequestForGroomerRow(data);
}

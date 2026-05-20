const CUSTOMER_FIELDS = 'id, auth_user_id, name, phone, email, username, created_at';

export function mapCustomerRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    authUserId: row.auth_user_id,
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    username: row.username || '',
    createdAt: row.created_at || '',
  };
}

function cleanOptionalText(value) {
  const cleaned = String(value || '').trim();
  return cleaned || null;
}

function cleanUsername(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return null;
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(cleaned)) {
    throw new Error('Username must be 3-32 letters, numbers, or underscores.');
  }

  return cleaned;
}

export async function getVerifiedAuthUser(supabase) {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.user?.id) {
    throw new Error('Sign in required.');
  }

  return data.user;
}

export async function loadCustomerForVerifiedUser(supabase) {
  const user = await getVerifiedAuthUser(supabase);
  const { data, error } = await supabase
    .from('customers')
    .select(CUSTOMER_FIELDS)
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    user,
    customer: mapCustomerRow(data),
  };
}

export async function createCustomerForVerifiedUser(supabase, profileInput = {}) {
  const user = await getVerifiedAuthUser(supabase);
  const row = {
    auth_user_id: user.id,
    email: cleanOptionalText(profileInput.email) || cleanOptionalText(user.email),
    name: cleanOptionalText(profileInput.name),
    phone: cleanOptionalText(profileInput.phone),
    username: cleanUsername(profileInput.username),
  };

  const { data, error } = await supabase
    .from('customers')
    .insert(row)
    .select(CUSTOMER_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    user,
    customer: mapCustomerRow(data),
  };
}

export async function updateCustomerForVerifiedUser(supabase, customer, profileInput = {}) {
  if (!customer?.id) {
    throw new Error('Customer profile required before updating account details.');
  }

  const user = await getVerifiedAuthUser(supabase);
  const row = {};

  if ('username' in profileInput) {
    row.username = cleanUsername(profileInput.username);
  }

  if (!Object.keys(row).length) {
    return {
      user,
      customer,
    };
  }

  const { data, error } = await supabase
    .from('customers')
    .update(row)
    .eq('id', customer.id)
    .eq('auth_user_id', user.id)
    .select(CUSTOMER_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    user,
    customer: mapCustomerRow(data),
  };
}

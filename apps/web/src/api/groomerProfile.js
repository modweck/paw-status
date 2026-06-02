// Read + update a groomer's business row. Writes are limited by the database
// to name/salon/phone/website/timezone/lead_time_hours (column-level grant) and
// to groomers the caller owns through a verified membership (RLS policy).
const GROOMER_PROFILE_FIELDS = 'id, name, salon, phone, website, timezone, lead_time_hours';

export function mapGroomerProfileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    salon: row.salon || '',
    phone: row.phone || '',
    website: row.website || '',
    timezone: row.timezone || '',
    leadTimeHours: row.lead_time_hours ?? null,
  };
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function isValidTimezone(timezone) {
  if (!timezone) return false;
  try {
    // Throws RangeError for an unknown IANA zone in every JS runtime.
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function isValidWebsite(url) {
  if (!url) return true; // optional
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function loadGroomerProfile(supabase, groomerId) {
  if (!groomerId) throw new Error('Groomer id is required.');

  const { data, error } = await supabase
    .from('groomers')
    .select(GROOMER_PROFILE_FIELDS)
    .eq('id', groomerId)
    .single();

  if (error) throw new Error(error.message);
  return mapGroomerProfileRow(data);
}

export async function updateGroomerBusinessDetails(supabase, groomerId, fields = {}) {
  if (!groomerId) throw new Error('Groomer id is required.');

  const row = {};

  if ('name' in fields) {
    const name = cleanText(fields.name);
    if (!name) throw new Error('Business name is required.');
    row.name = name;
  }
  if ('salon' in fields) row.salon = cleanText(fields.salon) || null;
  if ('phone' in fields) row.phone = cleanText(fields.phone) || null;
  if ('website' in fields) {
    const website = cleanText(fields.website);
    if (!isValidWebsite(website)) throw new Error('Enter a valid website URL.');
    row.website = website || null;
  }
  if ('timezone' in fields) {
    const timezone = cleanText(fields.timezone);
    if (!isValidTimezone(timezone)) throw new Error('Choose a valid timezone.');
    row.timezone = timezone;
  }
  if ('leadTimeHours' in fields) {
    const leadTime = Number(fields.leadTimeHours);
    if (!Number.isFinite(leadTime) || leadTime < 0) {
      throw new Error('Lead time must be zero or more hours.');
    }
    row.lead_time_hours = Math.trunc(leadTime);
  }

  if (!Object.keys(row).length) {
    return loadGroomerProfile(supabase, groomerId);
  }

  const { data, error } = await supabase
    .from('groomers')
    .update(row)
    .eq('id', groomerId)
    .select(GROOMER_PROFILE_FIELDS)
    .single();

  if (error) throw new Error(error.message);
  return mapGroomerProfileRow(data);
}

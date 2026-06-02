// CRUD for a groomer's recurring weekly hours and ad-hoc time-off. RLS limits
// writes to groomers the caller owns through a verified membership; the no-
// overlap rule for weekly windows is enforced here at the application layer.
const WEEKLY_HOURS_FIELDS = 'id, groomer_id, day_of_week, open_time, close_time';
const TIME_OFF_FIELDS = 'id, groomer_id, start_at, end_at';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function mapWeeklyHoursRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    groomerId: row.groomer_id,
    dayOfWeek: row.day_of_week,
    openTime: row.open_time || '',
    closeTime: row.close_time || '',
  };
}

export function mapTimeOffRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    groomerId: row.groomer_id,
    startAt: row.start_at || '',
    endAt: row.end_at || '',
  };
}

function cleanDayOfWeek(value) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new Error('Choose a day of the week.');
  }
  return day;
}

function cleanTime(value, message) {
  const time = String(value ?? '').trim();
  if (!TIME_PATTERN.test(time)) throw new Error(message);
  return time;
}

// Two windows overlap when each starts before the other ends. Times are
// zero-padded "HH:MM" so lexical comparison matches chronological order.
export function weeklyWindowsOverlap(a, b) {
  return a.dayOfWeek === b.dayOfWeek && a.openTime < b.closeTime && b.openTime < a.closeTime;
}

function assertNoOverlap(candidate, existing, ignoreId) {
  const clash = existing.some(
    (window) => window.id !== ignoreId && weeklyWindowsOverlap(window, candidate),
  );
  if (clash) {
    throw new Error('That window overlaps an existing one for this day.');
  }
}

function buildWeeklyWindow(input) {
  const dayOfWeek = cleanDayOfWeek(input.dayOfWeek);
  const openTime = cleanTime(input.openTime, 'Enter a valid opening time (HH:MM).');
  const closeTime = cleanTime(input.closeTime, 'Enter a valid closing time (HH:MM).');
  if (openTime >= closeTime) {
    throw new Error('Opening time must be before closing time.');
  }
  return { dayOfWeek, openTime, closeTime };
}

export async function loadWeeklyHours(supabase, groomerId) {
  if (!groomerId) throw new Error('Groomer id is required.');

  const { data, error } = await supabase
    .from('groomer_weekly_hours')
    .select(WEEKLY_HOURS_FIELDS)
    .eq('groomer_id', groomerId)
    .order('day_of_week', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(mapWeeklyHoursRow);
}

export async function createWeeklyHours(supabase, groomerId, input = {}, { existing = [] } = {}) {
  if (!groomerId) throw new Error('Groomer id is required.');

  const window = buildWeeklyWindow(input);
  assertNoOverlap(window, existing);

  const { data, error } = await supabase
    .from('groomer_weekly_hours')
    .insert({
      groomer_id: groomerId,
      day_of_week: window.dayOfWeek,
      open_time: window.openTime,
      close_time: window.closeTime,
    })
    .select(WEEKLY_HOURS_FIELDS)
    .single();

  if (error) throw new Error(error.message);
  return mapWeeklyHoursRow(data);
}

export async function updateWeeklyHours(supabase, id, input = {}, { existing = [] } = {}) {
  if (!id) throw new Error('Weekly-hours id is required.');

  const window = buildWeeklyWindow(input);
  assertNoOverlap(window, existing, id);

  const { data, error } = await supabase
    .from('groomer_weekly_hours')
    .update({
      day_of_week: window.dayOfWeek,
      open_time: window.openTime,
      close_time: window.closeTime,
    })
    .eq('id', id)
    .select(WEEKLY_HOURS_FIELDS)
    .single();

  if (error) throw new Error(error.message);
  return mapWeeklyHoursRow(data);
}

export async function deleteWeeklyHours(supabase, id) {
  if (!id) throw new Error('Weekly-hours id is required.');
  const { error } = await supabase.from('groomer_weekly_hours').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function loadTimeOff(supabase, groomerId) {
  if (!groomerId) throw new Error('Groomer id is required.');

  const { data, error } = await supabase
    .from('groomer_time_off')
    .select(TIME_OFF_FIELDS)
    .eq('groomer_id', groomerId)
    .order('start_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(mapTimeOffRow);
}

export async function createTimeOff(supabase, groomerId, input = {}) {
  if (!groomerId) throw new Error('Groomer id is required.');

  const startAt = String(input.startAt ?? '').trim();
  const endAt = String(input.endAt ?? '').trim();
  if (!startAt || !endAt) throw new Error('Enter a start and end for the time off.');
  if (!(new Date(startAt) < new Date(endAt))) {
    throw new Error('The start must be before the end.');
  }

  const { data, error } = await supabase
    .from('groomer_time_off')
    .insert({ groomer_id: groomerId, start_at: startAt, end_at: endAt })
    .select(TIME_OFF_FIELDS)
    .single();

  if (error) throw new Error(error.message);
  return mapTimeOffRow(data);
}

export async function deleteTimeOff(supabase, id) {
  if (!id) throw new Error('Time-off id is required.');
  const { error } = await supabase.from('groomer_time_off').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

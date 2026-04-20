// netlify/functions/send-sms.js
// Sends SMS status updates via Twilio.
// Env vars required on Netlify:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   Either TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM_NUMBER

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { type, toPhone, dogName, salonName, appointmentTime } = body;

  if (!toPhone) return { statusCode: 400, body: JSON.stringify({ error: 'toPhone required' }) };

  const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const MESSAGING_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

  if (!ACCOUNT_SID || !AUTH_TOKEN || (!MESSAGING_SID && !FROM_NUMBER)) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Twilio not configured on the server' }) };
  }

  const templates = {
    booked:            `🐾 Booking confirmed! ${dogName}'s appointment at ${salonName} is set for ${appointmentTime}.`,
    checked_in:        `✅ ${dogName} just checked in at ${salonName}. They're getting settled in now.`,
    bathing:           `🛁 ${dogName} is getting a bath right now at ${salonName}.`,
    drying:            `💨 Bath done! ${dogName} is getting blow-dried and brushed.`,
    almost_ready:      `✂️ ${dogName} is getting the finishing touches — head over to ${salonName} soon!`,
    ready_for_pickup:  `🎉 ${dogName} is ready! Come pick them up from ${salonName}. They look amazing! 🐾`,
    picked_up:         `👋 Thanks for picking up ${dogName}! See you next time at ${salonName}.`,
  };

  const message = templates[type];
  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown notification type: ' + type }) };
  }

  const to = normalizePhone(toPhone);
  if (!to) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid phone number: ' + toPhone }) };

  const form = new URLSearchParams();
  form.set('To', to);
  if (MESSAGING_SID) form.set('MessagingServiceSid', MESSAGING_SID);
  else form.set('From', FROM_NUMBER);
  form.set('Body', message);

  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: data.message || 'Twilio error', code: data.code }) };
    }
    return { statusCode: 200, body: JSON.stringify({ success: true, sid: data.sid, message }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (raw.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

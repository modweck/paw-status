// apps/web/netlify/functions/send-notification.js
// Set ONESIGNAL_APP_ID and ONESIGNAL_API_KEY in Netlify environment variables

export async function handler(event) {
  // TODO(backend): Decide whether OneSignal stays. If it does, move this behind
  // authenticated apps/api notification commands with audit logs and retries.

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { type, playerId, dogName, salonName, appointmentTime } = JSON.parse(event.body);
  // TODO(backend): Add invalid JSON handling, required-field validation, missing
  // env checks, and non-2xx OneSignal response handling before this can ship.

  const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
  const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

  const notifications = {

    booking_confirmed: {
      title: '🐾 Booking Confirmed!',
      message: `${dogName}'s appointment at ${salonName} is confirmed for ${appointmentTime}.`,
    },

    reminder_24h: {
      title: '⏰ Appointment Tomorrow',
      message: `Reminder: ${dogName} has a grooming appointment tomorrow at ${appointmentTime} at ${salonName}.`,
    },

    reminder_1h: {
      title: '🚿 Almost Time!',
      message: `${dogName}'s appointment at ${salonName} is in 1 hour. Don't forget!`,
    },

    checked_in: {
      title: '✅ Checked In!',
      message: `${dogName} has arrived at ${salonName} and is getting settled in. 🐕`,
    },

    bathing: {
      title: '🛁 Bath Time!',
      message: `${dogName} is getting a nice bath right now at ${salonName}.`,
    },

    drying: {
      title: '💨 Getting Dried!',
      message: `Bath done! ${dogName} is getting blow-dried and brushed.`,
    },

    almost_ready: {
      title: '✂️ Almost Ready — Head Over!',
      message: `${dogName} is getting the finishing touches. Start making your way to ${salonName}! 🚶`,
    },

    ready_for_pickup: {
      title: `🎉 ${dogName} is Ready!`,
      message: `Come pick up ${dogName} from ${salonName}. They look amazing! 🐾`,
    },

    no_show: {
      title: '⚠️ Missed Appointment',
      message: `You missed ${dogName}'s appointment at ${salonName}. A cancellation fee may apply.`,
    },

    rebook_reminder: {
      title: `Time for ${dogName}'s Next Groom! 🐾`,
      message: `It's been a while! Book ${dogName}'s next appointment at ${salonName}.`,
    },

  };

  const notification = notifications[type];

  if (!notification) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Unknown notification type: ${type}` })
    };
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: [playerId],
        headings: { en: notification.title },
        contents: { en: notification.message },
        chrome_web_icon: '/images/paw-icon.png',
        // TODO(backend): Replace this placeholder with PUBLIC_APP_URL plus a
        // real booking/request route generated from trusted server data.
        url: `https://yourapp.com/booking/${dogName.toLowerCase()}`,
        ttl: 259200,
      }),
    });

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        notificationId: data.id,
        type,
        message: notification.message
      }),
    };

  } catch (error) {
    console.error('OneSignal error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send notification' }),
    };
  }
}

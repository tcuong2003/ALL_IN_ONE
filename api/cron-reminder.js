module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let webpush;
    try {
      webpush = require('web-push');
    } catch (reqErr) {
      return res.status(200).json({
        error: 'Failed to require web-push',
        details: reqErr.message,
        stack: reqErr.stack
      });
    }

    const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BFX-a3bf7VVGRGGR1WkmTQKQH93aoWVH56dNTwU6gzdSEApbd_RerTka_n9m0fJLE6CZsYbphUOv80VllkZuo1s';
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'Rh6EFsSlM7Z_Pr3LIhNAHOdgfpa9xgr-M2_ux2iA7A4';
    const VAPID_SUBJECT = 'mailto:support@allinone.com';
    const FIREBASE_DB_URL = 'https://all-in-one-86a90-default-rtdb.asia-southeast1.firebasedatabase.app';

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // Current time in Vietnam (Asia/Ho_Chi_Minh)
    const now = new Date();
    const vnFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const currentVnTime = vnFormatter.format(now);
    const [currentHour, currentMin] = currentVnTime.split(':').map(Number);

    const isForce = req.query && (req.query.force === '1' || req.query.force === 'true');

    // Fetch all active reminders from Firebase
    const response = await fetch(`${FIREBASE_DB_URL}/reminders.json`);
    const remindersData = await response.json();

    if (!remindersData) {
      return res.status(200).json({
        message: 'No reminders found in database',
        currentVnTime
      });
    }

    const results = [];
    const keys = Object.keys(remindersData);

    for (const key of keys) {
      const item = remindersData[key];
      if (!item || !item.enabled || !item.subscription) continue;

      let shouldSend = isForce;

      if (!shouldSend && item.time) {
        const [itemHour, itemMin] = item.time.split(':').map(Number);
        if (itemHour === currentHour && Math.abs(itemMin - currentMin) <= 10) {
          shouldSend = true;
        }
      }

      if (shouldSend) {
        const profileLabel = item.profile === 'em' ? 'Em' : 'Anh';
        const payload = JSON.stringify({
          title: 'All In One • Nhắc nhở chi tiêu 📝',
          body: `Đã ${item.time || currentVnTime} rồi! ${profileLabel} ơi, hôm nay mình đã ghi chép chi tiêu đầy đủ chưa?`,
          url: '/?tab=ledger&subtab=input'
        });

        try {
          const pushRes = await webpush.sendNotification(item.subscription, payload);
          results.push({ key, success: true, statusCode: pushRes.statusCode });
        } catch (err) {
          console.error(`Failed to push to reminder ${key}:`, err);
          results.push({ key, success: false, error: err.message, statusCode: err.statusCode });

          if (err.statusCode === 404 || err.statusCode === 410) {
            try {
              await fetch(`${FIREBASE_DB_URL}/reminders/${key}.json`, { method: 'DELETE' });
            } catch (delErr) {
              console.warn(`Failed to delete expired subscription ${key}:`, delErr);
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      currentVnTime,
      totalChecked: keys.length,
      processed: results
    });
  } catch (error) {
    return res.status(200).json({
      error: 'Handler crashed',
      message: error.message,
      stack: error.stack
    });
  }
};

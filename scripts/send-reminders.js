const webpush = require('web-push');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BFX-a3bf7VVGRGGR1WkmTQKQH93aoWVH56dNTwU6gzdSEApbd_RerTka_n9m0fJLE6CZsYbphUOv80VllkZuo1s';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'Rh6EFsSlM7Z_Pr3LIhNAHOdgfpa9xgr-M2_ux2iA7A4';
const VAPID_SUBJECT = 'mailto:support@allinone.com';
const FIREBASE_DB_URL = 'https://all-in-one-86a90-default-rtdb.asia-southeast1.firebasedatabase.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

async function run() {
  console.log('--- ALL IN ONE PUSH REMINDER RUNNER ---');
  const now = new Date();
  const vnFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const currentVnTime = vnFormatter.format(now);
  console.log(`Current Vietnam Time: ${currentVnTime}`);
  const [currentHour, currentMin] = currentVnTime.split(':').map(Number);

  const res = await fetch(`${FIREBASE_DB_URL}/reminders.json`);
  const reminders = await res.json();

  if (!reminders) {
    console.log('No reminders registered in Firebase.');
    return;
  }

  const keys = Object.keys(reminders);
  console.log(`Found ${keys.length} registered profiles in Firebase.`);

  for (const key of keys) {
    const item = reminders[key];
    if (!item || !item.enabled || !item.subscription) {
      console.log(`Skipping ${key}: disabled or no subscription.`);
      continue;
    }

    let shouldSend = false;
    if (item.time) {
      const [itemHour, itemMin] = item.time.split(':').map(Number);
      if (itemHour === currentHour) {
        shouldSend = true;
      }
    } else {
      if (currentHour === 21) shouldSend = true;
    }

    if (shouldSend || process.env.FORCE_SEND === '1') {
      const profileName = item.profile === 'em' ? 'Em' : 'Anh';
      const payload = JSON.stringify({
        title: 'All In One • Nhắc nhở chi tiêu 📝',
        body: `Đã ${item.time || currentVnTime} rồi! ${profileName} ơi, hôm nay mình đã ghi chép các khoản chi tiêu đầy đủ chưa?`,
        url: '/?tab=ledger&subtab=input'
      });

      console.log(`Sending push notification to ${profileName} (${key})...`);
      try {
        const pushRes = await webpush.sendNotification(item.subscription, payload);
        console.log(`✓ Push sent successfully to ${profileName}! Status: ${pushRes.statusCode}`);
      } catch (err) {
        console.error(`✗ Push failed for ${profileName}:`, err.message);
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`Cleaning up expired subscription for ${key}...`);
          try {
            await fetch(`${FIREBASE_DB_URL}/reminders/${key}.json`, { method: 'DELETE' });
          } catch (e) {}
        }
      }
    } else {
      console.log(`Profile ${key} is scheduled for ${item.time}, not current hour (${currentHour}:00).`);
    }
  }

  console.log('--- RUNNER FINISHED ---');
}

run().catch(err => {
  console.error('Fatal error running push reminder:', err);
  process.exit(1);
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let webpush;
    try {
      webpush = require('web-push');
    } catch (reqErr) {
      return res.status(500).json({
        error: 'Failed to load web-push package',
        details: reqErr.message
      });
    }

    const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BFX-a3bf7VVGRGGR1WkmTQKQH93aoWVH56dNTwU6gzdSEApbd_RerTka_n9m0fJLE6CZsYbphUOv80VllkZuo1s';
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'Rh6EFsSlM7Z_Pr3LIhNAHOdgfpa9xgr-M2_ux2iA7A4';
    const VAPID_SUBJECT = 'mailto:support@allinone.com';

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const { subscription, title, body, url } = req.body || {};

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing subscription object' });
    }

    const payload = JSON.stringify({
      title: title || 'All In One • Thông báo thử nghiệm 🎉',
      body: body || 'iPhone của bạn đã kết nối thành công với tính năng nhắc nhở chi tiêu!',
      url: url || '/?tab=ledger'
    });

    const result = await webpush.sendNotification(subscription, payload);

    return res.status(200).json({
      success: true,
      statusCode: result.statusCode,
      message: 'Push sent successfully!'
    });
  } catch (error) {
    console.error('Error sending push notification:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send push notification',
      statusCode: error.statusCode
    });
  }
};

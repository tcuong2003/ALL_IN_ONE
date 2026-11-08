// All In One Service Worker for PWA & Web Push Notifications
const SW_VERSION = 'v1.2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen to Push Notifications sent from server
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'All In One', body: event.data.text() };
    }
  }

  const title = data.title || 'All In One • Sổ Thu Chi 📝';
  const options = {
    body: data.body || 'Hôm nay bạn đã ghi chép các khoản chi tiêu chưa?',
    icon: data.icon || '/favicon.png',
    badge: '/favicon-32x32.png',
    vibrate: [150, 80, 150],
    tag: 'aio-ledger-reminder',
    renotify: true,
    data: {
      url: data.url || '/?tab=ledger',
      time: Date.now()
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle clicking on notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/?tab=ledger';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if ('focus' in client) {
          if (client.url && client.url.includes(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

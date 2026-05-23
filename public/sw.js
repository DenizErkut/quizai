// Pratium Service Worker - Push Notifications

self.addEventListener('push', function(event) {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Pratium\'dan yeni bir bildirim var!',
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/quiz' },
    actions: [
      { action: 'open', title: '🚀 Hemen Git' },
      { action: 'close', title: 'Kapat' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pratium', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'close') return;
  
  const url = event.notification.data?.url || '/quiz';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});

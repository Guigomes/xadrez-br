// Custom service worker code — merged by next-pwa into sw.js

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data: { title?: string; body?: string; url?: string } = {};
  try { data = event.data.json(); } catch { data = { body: event.data.text() }; }

  const title = data.title ?? 'XadrezBR';
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: { url: data.url ?? '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    (self.clients as any).matchAll({ type: 'window', includeUncontrolled: true }).then((clients: WindowClient[]) => {
      const existing = clients.find((c) => c.url === url && 'focus' in c);
      if (existing) return existing.focus();
      return (self.clients as any).openWindow(url);
    })
  );
});

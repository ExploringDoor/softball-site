importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

// Force immediate activation so a new SW takes over without waiting for all
// old clients to close. Critical on iOS where PWA clients linger.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

firebase.initializeApp({
  apiKey: "AIzaSyDXuC-R0aPEX4F7lN5AKq48UC3r5whYzdg",
  authDomain: "dvsl-292dd.firebaseapp.com",
  projectId: "dvsl-292dd",
  storageBucket: "dvsl-292dd.firebasestorage.app",
  messagingSenderId: "145862305559",
  appId: "1:145862305559:web:153ec455bad57e17517952"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification?.title || payload.data?.title || 'DVSL Update';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/dvsl-logo-dark.png',
    badge: '/dvsl-logo-dark.png',
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});

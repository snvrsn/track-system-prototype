import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getMessaging,
  onBackgroundMessage,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-sw.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  const notification = payload.data || {};
  return self.registration.showNotification(notification.title || "Track reminder", {
    body: notification.body || "A scheduled reminder is due.",
    data: { clickUrl: notification.clickUrl || "./" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const clickUrl = new URL(event.notification.data?.clickUrl || "./", self.location.origin);
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === clickUrl.origin) {
        await client.navigate(clickUrl.href);
        return client.focus();
      }
    }
    return clients.openWindow(clickUrl.href);
  })());
});

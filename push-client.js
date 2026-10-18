import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js";
import {
  ref,
  remove,
  set,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { app, database } from "./firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";

let foregroundListenerRegistered = false;

export async function listenForForegroundNotifications() {
  if (foregroundListenerRegistered || !(await isSupported())) return;
  const messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    if (Notification.permission !== "granted") return;
    const data = payload.data || {};
    const notification = new Notification(data.title || "Track reminder", {
      body: data.body || "A scheduled reminder is due.",
    });
    notification.addEventListener("click", () => {
      notification.close();
      const target = new URL(data.clickUrl || "./", window.location.href);
      if (target.origin === window.location.origin) {
        window.location.assign(target.href);
      }
    });
  });
  foregroundListenerRegistered = true;
}

export async function enablePushNotifications(user) {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) {
    throw new Error("Push notifications require this site to be hosted over HTTPS.");
  }
  if (!("Notification" in window) || !("PushManager" in window)) {
    throw new Error("This browser does not support notifications.");
  }
  if (!firebaseConfig.vapidKey || firebaseConfig.vapidKey.includes("PASTE_")) {
    throw new Error("Add the Web Push public key to firebase-config.js first.");
  }

  const permissionRequest = Notification.requestPermission();
  const [supported, permission] = await Promise.all([
    isSupported(),
    permissionRequest,
  ]);
  if (!supported) {
    throw new Error("This browser does not support Firebase web push.");
  }
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }
  await listenForForegroundNotifications();

  const registration = await navigator.serviceWorker.register("./firebase-messaging-sw.js", {
    type: "module",
  });
  const token = await getToken(getMessaging(app), {
    vapidKey: firebaseConfig.vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) {
    throw new Error("Firebase did not return a notification token for this device.");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const tokenKey = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  await set(ref(database, `users/${user.uid}/pushTokens/${tokenKey}`), {
    token,
    updatedAt: Date.now(),
  });
  localStorage.setItem(`track-push-token:${user.uid}`, tokenKey);
}

export async function disablePushNotifications(user) {
  if (!user?.uid) throw new Error("Sign in before changing notification settings.");

  const storageKey = `track-push-token:${user.uid}`;
  const tokenKey = localStorage.getItem(storageKey);
  if (!tokenKey) return;

  await remove(ref(database, `users/${user.uid}/pushTokens/${tokenKey}`));
  localStorage.removeItem(storageKey);
  if ("serviceWorker" in navigator && (await isSupported())) {
    await deleteToken(getMessaging(app));
  }
}

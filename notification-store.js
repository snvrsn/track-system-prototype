import {
  equalTo,
  get,
  orderByChild,
  push,
  query,
  ref,
  remove,
  set,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { database } from "./firebase-app.js";

export async function schedulePersonalNotification(user, notification) {
  if (!user?.uid) throw new Error("Sign in before scheduling a notification.");
  if (!Number.isFinite(notification.scheduledAt) || notification.scheduledAt <= Date.now()) {
    throw new Error("Choose a notification time in the future.");
  }

  const notificationRef = push(ref(database, "notificationQueue"));
  await set(notificationRef, {
    ownerUid: user.uid,
    scheduledAt: notification.scheduledAt,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    title: String(notification.title || "Track reminder").slice(0, 160),
    body: String(notification.body || "A scheduled reminder is due.").slice(0, 2000),
    targetType: notification.targetType,
    targetId: notification.targetId,
    status: "pending",
    createdAt: Date.now(),
  });
  return notificationRef.key;
}

export async function cancelPersonalNotifications(user, targetType, targetId) {
  if (!user?.uid) throw new Error("Sign in before managing notifications.");

  const queue = await get(query(
    ref(database, "notificationQueue"),
    orderByChild("ownerUid"),
    equalTo(user.uid),
  ));
  const pending = Object.entries(queue.val() || {}).filter(
    ([, notification]) =>
      notification?.targetType === targetType &&
      notification.targetId === targetId &&
      notification.status === "pending",
  );
  await Promise.all(pending.map(([id]) => remove(ref(database, `notificationQueue/${id}`))));
  return pending.length;
}

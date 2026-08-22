// Importing the firebase config initializes the Admin SDK (singleton) as a side effect.
import admin, { isFirebaseReady } from "../../../config/firebase";

import { INotificationPayload } from "../notification.interface";

/** Sends a push to one device. Resolves to null when Firebase isn't configured. */
export const sendPushNotification = async (
  fcmToken: string,
  payload: INotificationPayload,
): Promise<string | null> => {
  if (!isFirebaseReady()) {
    console.log("Firebase not initialized — skipping push notification.");
    return null;
  }
  if (!fcmToken?.trim()) return null;

  try {
    return await admin.messaging().send({
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      ...(payload.data && { data: payload.data }),
    });
  } catch (error) {
    // Push failures must never break the request that triggered them.
    console.error("Error sending push notification:", error);
    return null;
  }
};

/** Sends the same push to many devices in one batch. */
export const sendPushNotificationToMultiple = async (
  tokens: string[],
  payload: INotificationPayload,
): Promise<admin.messaging.BatchResponse> => {
  const empty = { responses: [], successCount: 0, failureCount: 0 };

  if (!isFirebaseReady()) {
    console.log("Firebase not initialized — skipping push notification.");
    return empty;
  }

  const validTokens = tokens.filter(Boolean);
  if (validTokens.length === 0) return empty;

  try {
    const message: admin.messaging.MulticastMessage = {
      tokens: validTokens,
      notification: { title: payload.title, body: payload.body },
      ...(payload.data && { data: payload.data }),
      android: { priority: "high" },
      apns: { headers: { "apns-priority": "10" } },
    };

    const batchResponse = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `Push sent: ${batchResponse.successCount} ok, ${batchResponse.failureCount} failed`,
    );
    return batchResponse;
  } catch (error) {
    console.error("Error sending push notifications:", error);
    return empty;
  }
};

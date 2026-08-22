import admin from "firebase-admin";
import { readFileSync } from "fs";
import { FIREBASE_SERVICE_ACCOUNT_PATH } from "./index";

// Initialize the Firebase Admin SDK once (singleton).
// Wrapped in try/catch so a missing/invalid service account file never crashes
// the server at startup — push sending will just no-op (see isFirebaseReady).
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"),
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin initialized.");
  } catch (error) {
    console.error(
      "Firebase Admin initialization failed:",
      (error as Error).message,
    );
  }
}

export const isFirebaseReady = () => admin.apps.length > 0;

export default admin;

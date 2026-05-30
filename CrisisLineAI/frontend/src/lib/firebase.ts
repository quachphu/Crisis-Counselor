import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type UserCredential,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => value.length > 0,
);

const app = isFirebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : undefined;

export const auth = app ? getAuth(app) : undefined;
export const db = app ? getFirestore(app) : undefined;

const googleProvider = auth ? new GoogleAuthProvider() : undefined;

if (googleProvider) {
  googleProvider.setCustomParameters({
    prompt: "select_account",
  });
}

export async function signInWithGooglePopup(): Promise<UserCredential> {
  if (!auth || !googleProvider) {
    throw new Error("Firebase Auth is not configured.");
  }

  return signInWithPopup(auth, googleProvider);
}

export async function signOutCurrentUser(): Promise<void> {
  if (!auth) {
    throw new Error("Firebase Auth is not configured.");
  }

  await signOut(auth);
}

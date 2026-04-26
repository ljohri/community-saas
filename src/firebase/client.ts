import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  } as const;
}

export function isFirebaseConfigured(): boolean {
  const c = getConfig();
  return !!(c.apiKey && c.authDomain && c.projectId && c.appId);
}

export function getFirebaseAuth(): Auth {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env and fill in VITE_FIREBASE_* values.",
    );
  }
  if (!app) {
    app = initializeApp(getConfig());
    auth = getAuth(app);
  }
  return auth!;
}

export async function signInWithGoogle(): Promise<User> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutCurrent(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export function watchIdToken(cb: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return onIdTokenChanged(auth, cb);
}

export async function getIdToken(force = false): Promise<string | null> {
  if (!auth) return null;
  const u = auth.currentUser;
  if (!u) return null;
  return u.getIdToken(force);
}

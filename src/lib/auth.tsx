import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import {
  getIdToken,
  isFirebaseConfigured,
  signInWithGoogle,
  signOutCurrent,
  watchIdToken,
} from "../firebase/client";
import type { SessionInfo } from "./types";
import { fetchSession } from "./api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  session: SessionInfo | null;
  refreshSession: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getToken: (force?: boolean) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(configured);

  const refreshSession = useCallback(async () => {
    try {
      const s = await fetchSession();
      setSession(s);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const unsub = watchIdToken(async (u) => {
      setUser(u);
      setLoading(false);
      await refreshSession();
    });
    return () => unsub();
  }, [configured, refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured,
      session,
      refreshSession,
      signIn: async () => {
        await signInWithGoogle();
      },
      signOut: async () => {
        await signOutCurrent();
        setSession(null);
      },
      getToken: (force = false) => getIdToken(force),
    }),
    [user, loading, configured, session, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

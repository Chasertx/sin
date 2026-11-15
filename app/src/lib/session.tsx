import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setAuthToken, setUnauthorizedHandler } from './api';
import type { AuthResponse } from './types';

const KEY = 'gwyg.session';

interface SessionData {
  token: string;
  userId: string;
  displayName: string;
}

interface SessionContextValue {
  session: SessionData | null;
  isLoading: boolean;
  /** True right after an SSO sign-up, until the profile is filled in. */
  needsOnboarding: boolean;
  /** The address a Google/Apple sign-in came from, for showing on the rest of sign-up. Never stored. */
  email: string | null;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  finishOnboarding: () => void;
  /** The server says this account hasn't finished signing up (e.g. after the app was restarted mid-way). */
  requireOnboarding: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as SessionData;
        setAuthToken(saved.token);
        setSession(saved);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setSession(null);
    setNeedsOnboarding(false);
    setEmail(null);
    await SecureStore.deleteItemAsync(KEY).catch(() => {});
  }, []);

  useEffect(() => setUnauthorizedHandler(() => void signOut()), [signOut]);

  const signIn = useCallback(async (auth: AuthResponse) => {
    const data: SessionData = { token: auth.token, userId: auth.userId, displayName: auth.displayName };
    setAuthToken(data.token);
    setNeedsOnboarding(auth.needsOnboarding);
    setEmail(auth.email ?? null);
    setSession(data);
    await SecureStore.setItemAsync(KEY, JSON.stringify(data)).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      needsOnboarding,
      email,
      signIn,
      signOut,
      finishOnboarding: () => setNeedsOnboarding(false),
      requireOnboarding: () => setNeedsOnboarding(true),
    }),
    [session, isLoading, needsOnboarding, email, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

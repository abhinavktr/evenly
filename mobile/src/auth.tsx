import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { config, entra } from './config';

WebBrowser.maybeCompleteAuthSession();

const KEY = 'evenly.session';

interface Session {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  devEmail?: string; // dev auth mode only
}

interface AuthCtx {
  ready: boolean;
  signedIn: boolean;
  signIn: () => Promise<void>;
  signInDev: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Headers to authenticate an API call (refreshes the token when needed). */
  authHeaders: () => Promise<Record<string, string>>;
  error?: string;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const sessionRef = useRef<Session | null>(null);
  const refreshing = useRef<Promise<Session | null> | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'evenly', path: 'auth' });
  const discovery = AuthSession.useAutoDiscovery(config.authMode === 'entra' ? entra.issuer : '');
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    { clientId: config.clientId, scopes: entra.scopes, redirectUri, usePKCE: true },
    config.authMode === 'entra' ? discovery : null,
  );

  const save = useCallback(async (s: Session | null) => {
    sessionRef.current = s;
    setSession(s);
    if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
    else await SecureStore.deleteItemAsync(KEY);
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((raw) => {
        const s = raw ? (JSON.parse(raw) as Session) : null;
        sessionRef.current = s;
        setSession(s);
      })
      .finally(() => setReady(true));
  }, []);

  const fromToken = (t: AuthSession.TokenResponse, prevRefresh?: string): Session => ({
    accessToken: t.accessToken,
    refreshToken: t.refreshToken ?? prevRefresh,
    expiresAt: Date.now() + (t.expiresIn ?? 3600) * 1000,
  });

  const signIn = useCallback(async () => {
    setError(undefined);
    if (!request || !discovery) {
      setError('Sign-in is not configured. Check the EXPO_PUBLIC_ENTRA_* settings.');
      return;
    }
    const result = await promptAsync();
    if (result.type !== 'success') {
      if (result.type === 'error') setError(result.error?.message ?? 'Sign-in failed');
      return;
    }
    try {
      const token = await AuthSession.exchangeCodeAsync(
        { clientId: config.clientId, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier! } },
        discovery,
      );
      await save(fromToken(token));
    } catch (e: any) {
      setError(e?.message ?? 'Could not complete sign-in');
    }
  }, [request, discovery, promptAsync, redirectUri, save]);

  const signInDev = useCallback(async (email: string) => save({ devEmail: email.trim().toLowerCase() }), [save]);

  const signOut = useCallback(async () => save(null), [save]);

  const refresh = useCallback(async (): Promise<Session | null> => {
    const s = sessionRef.current;
    if (!s?.refreshToken || !discovery) return null;
    try {
      const t = await AuthSession.refreshAsync({ clientId: config.clientId, refreshToken: s.refreshToken, scopes: entra.scopes }, discovery);
      const next = fromToken(t, s.refreshToken);
      await save(next);
      return next;
    } catch {
      await save(null); // refresh token expired or revoked — back to sign-in
      return null;
    }
  }, [discovery, save]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    let s = sessionRef.current;
    if (s?.devEmail) return { 'x-dev-user': s.devEmail };
    if (s && (!s.accessToken || (s.expiresAt ?? 0) - Date.now() < 60_000)) {
      refreshing.current ??= refresh().finally(() => (refreshing.current = null));
      s = await refreshing.current;
    }
    if (!s?.accessToken) throw new Error('Signed out');
    return { Authorization: `Bearer ${s.accessToken}` };
  }, [refresh]);

  const value = useMemo<AuthCtx>(
    () => ({ ready, signedIn: !!session, signIn, signInDev, signOut, authHeaders, error }),
    [ready, session, signIn, signInDev, signOut, authHeaders, error],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

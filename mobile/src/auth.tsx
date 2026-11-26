import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { config, entra } from './config';

WebBrowser.maybeCompleteAuthSession();

const KEY = 'evenly.session';
const PENDING_KEY = 'evenly.pendingAuth';

/** Saved before opening the browser so a restarted app can still redeem the code. */
interface Pending {
  state: string;
  verifier: string;
  redirectUri: string;
}

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

  /**
   * Redeems an authorization code exactly once.
   * The code can arrive two ways: as the result of promptAsync (normal case), or as a deep link
   * (evenly://auth?code=…) when Android restarted the app while the user was away — e.g. reading
   * the sign-up verification email. The PKCE verifier is persisted so the second path still works.
   */
  const redeemed = useRef(new Set<string>());
  const exchangeOnce = useCallback(
    async (code: string, state: string | undefined) => {
      if (!discovery || redeemed.current.has(code)) return;
      redeemed.current.add(code);
      const raw = await SecureStore.getItemAsync(PENDING_KEY);
      const pending = raw ? (JSON.parse(raw) as Pending) : null;
      if (!pending || (state && pending.state && state !== pending.state)) {
        if (!sessionRef.current) setError('Sign-in expired. Please try again.');
        return;
      }
      await SecureStore.deleteItemAsync(PENDING_KEY);
      try {
        const token = await AuthSession.exchangeCodeAsync(
          { clientId: config.clientId, code, redirectUri: pending.redirectUri, extraParams: { code_verifier: pending.verifier } },
          discovery,
        );
        setError(undefined);
        await save(fromToken(token));
      } catch (e: any) {
        setError(e?.message ?? 'Could not complete sign-in');
      }
    },
    [discovery, save],
  );

  const signIn = useCallback(async () => {
    setError(undefined);
    if (!request || !discovery || !request.codeVerifier) {
      setError('Sign-in is not configured. Check the EXPO_PUBLIC_ENTRA_* settings.');
      return;
    }
    const pending: Pending = { state: request.state, verifier: request.codeVerifier, redirectUri };
    await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(pending));
    const result = await promptAsync();
    if (result.type === 'success') await exchangeOnce(result.params.code, result.params.state);
    else if (result.type === 'error') setError(result.error?.message ?? 'Sign-in failed');
    // 'dismiss'/'cancel': if the code arrives as a deep link instead, the effect below handles it
  }, [request, discovery, promptAsync, redirectUri, exchangeOnce]);

  // Deep-link path: evenly://auth?code=…&state=… (cold start or app restarted mid sign-up)
  const url = Linking.useURL();
  useEffect(() => {
    if (!url || !discovery) return;
    const { path, queryParams } = Linking.parse(url);
    if (!path?.replace(/\//g, '').startsWith('auth')) return;
    const q = (queryParams ?? {}) as Record<string, string | undefined>;
    if (q.code) exchangeOnce(q.code, q.state);
    else if (q.error && !sessionRef.current) setError(q.error_description ?? q.error);
  }, [url, discovery, exchangeOnce]);

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

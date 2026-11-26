import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApi, type User } from './api';

interface MeCtx {
  me?: User;
  error?: string;
  /** id -> display name for everyone we know about */
  names: Record<string, string>;
  nameOf: (id: string) => string;
  rememberPeople: (people: { id: string; name: string }[]) => void;
  refreshMe: () => Promise<void>;
}

const Ctx = createContext<MeCtx | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [me, setMe] = useState<User>();
  const [error, setError] = useState<string>();
  const [names, setNames] = useState<Record<string, string>>({});

  const rememberPeople = useCallback((people: { id: string; name: string }[]) => {
    setNames((prev) => {
      const next = { ...prev };
      for (const p of people) next[p.id] = p.name;
      return next;
    });
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const u = await api.me(); // also registers the user on first sign-in
      setMe(u);
      rememberPeople([u]);
      rememberPeople(await api.friends());
      setError(undefined);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your profile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  const nameOf = useCallback(
    (id: string) => (id === me?.id ? 'You' : names[id] ?? id.split('@')[0]!),
    [me?.id, names],
  );

  return <Ctx.Provider value={{ me, error, names, nameOf, rememberPeople, refreshMe }}>{children}</Ctx.Provider>;
}

export function useMe() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useMe outside MeProvider');
  return c;
}

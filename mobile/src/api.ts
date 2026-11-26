import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useAuth } from './auth';
import { config } from './config';
import type { Portion, SplitType } from './money';

export type Balance = Record<string, number>; // currency -> minor units (+ owed to me, − I owe)

export interface User { id: string; email: string; name: string; registered: boolean; defaultCurrency?: string }
export interface Friend extends User { balance: Balance }
export interface Group {
  id: string; name: string; currency: string; memberIds: string[]; createdBy: string; createdAt: string; updatedAt: string;
  myBalance?: Balance;
}
export interface Expense {
  id: string; kind: 'expense' | 'payment'; groupId: string | null; description: string; amount: number; currency: string;
  date: string; splitType: SplitType; paidBy: Portion[]; shares: Portion[]; participantIds: string[]; notes?: string;
  createdBy: string; createdAt: string; updatedAt: string; deleted?: boolean; deletedBy?: string;
}
export interface Debt { from: string; to: string; amount: number; currency: string }
export interface GroupDetail { group: Group; members: Friend[]; simplifiedDebts: Debt[]; expenses: Expense[] }
export interface FriendDetail { friend: User; balance: Balance; expenses: Expense[] }
export interface Activity extends Expense { myEffect: number; actorName: string }
export interface Summary { net: Balance; youAreOwed: Balance; youOwe: Balance }

export type NewExpense = Omit<Expense, 'id' | 'kind' | 'participantIds' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deleted' | 'deletedBy'>;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function useApi() {
  const { authHeaders, signOut } = useAuth();

  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
      const res = await fetch(`${config.apiUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 401) { await signOut(); throw new ApiError(401, 'Your session expired. Please sign in again.'); }
      if (res.status === 204) return undefined as T;
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`);
      return json as T;
    },
    [authHeaders, signOut],
  );

  return {
    me: () => call<User>('GET', '/me'),
    updateMe: (b: { name?: string; defaultCurrency?: string }) => call<User>('PATCH', '/me', b),
    friends: () => call<Friend[]>('GET', '/friends'),
    friend: (id: string) => call<FriendDetail>('GET', `/friends/${encodeURIComponent(id)}`),
    addFriend: (email: string, name?: string) => call<User>('POST', '/friends', { email, name }),
    groups: () => call<Group[]>('GET', '/groups'),
    group: (id: string) => call<GroupDetail>('GET', `/groups/${id}`),
    createGroup: (b: { name: string; currency: string; members: { email: string; name?: string }[] }) => call<Group>('POST', '/groups', b),
    updateGroup: (id: string, b: { name?: string; currency?: string }) => call<Group>('PATCH', `/groups/${id}`, b),
    addMember: (id: string, email: string, name?: string) => call<User>('POST', `/groups/${id}/members`, { email, name }),
    removeMember: (id: string, userId: string) => call<void>('DELETE', `/groups/${id}/members/${encodeURIComponent(userId)}`),
    expense: (id: string) => call<Expense>('GET', `/expenses/${id}`),
    createExpense: (b: NewExpense) => call<Expense>('POST', '/expenses', b),
    updateExpense: (id: string, b: NewExpense) => call<Expense>('PUT', `/expenses/${id}`, b),
    deleteExpense: (id: string) => call<void>('DELETE', `/expenses/${id}`),
    settle: (b: { from: string; to: string; amount: number; currency: string; groupId?: string | null }) => call<Expense>('POST', '/settlements', b),
    balances: () => call<Summary>('GET', '/balances'),
    activity: () => call<Activity[]>('GET', '/activity'),
  };
}

/** Loads data whenever the screen gains focus. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loaderRef.current());
      setError(undefined);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { data, error, loading, reload };
}

import { HttpError } from './http.js';
import type { Portion, SplitType } from './types.js';

export const normEmail = (e: unknown): string => {
  if (typeof e !== 'string') throw new HttpError(400, 'email is required');
  const v = e.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new HttpError(400, `invalid email: ${e}`);
  return v;
};

export const str = (v: unknown, field: string, max = 200): string => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} is required`);
  if (v.length > max) throw new HttpError(400, `${field} is too long`);
  return v.trim();
};

export const currency = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[A-Z]{3}$/.test(v)) throw new HttpError(400, 'currency must be a 3-letter ISO code');
  return v;
};

export const positiveInt = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > 1e12)
    throw new HttpError(400, `${field} must be a positive integer in minor units`);
  return v;
};

export const splitType = (v: unknown): SplitType => {
  if (v === undefined) return 'equal';
  if (v === 'equal' || v === 'exact' || v === 'percent' || v === 'shares') return v;
  throw new HttpError(400, 'invalid splitType');
};

/** Validates a list of portions and that they sum exactly to `total`. Merges duplicates. */
export function portions(v: unknown, field: string, total: number, allowZero = false): Portion[] {
  if (!Array.isArray(v) || v.length === 0) throw new HttpError(400, `${field} must be a non-empty array`);
  const merged = new Map<string, number>();
  for (const p of v) {
    const userId = normEmail(p?.userId);
    const amt = p?.amount;
    if (typeof amt !== 'number' || !Number.isInteger(amt) || amt < 0 || (!allowZero && amt === 0))
      throw new HttpError(400, `${field}: amounts must be ${allowZero ? 'non-negative' : 'positive'} integers`);
    merged.set(userId, (merged.get(userId) ?? 0) + amt);
  }
  const sum = [...merged.values()].reduce((a, b) => a + b, 0);
  if (sum !== total) throw new HttpError(400, `${field} must add up to the total (${sum} ≠ ${total})`);
  return [...merged].filter(([, a]) => a > 0).map(([userId, amount]) => ({ userId, amount }));
}

export const isoDate = (v: unknown): string => {
  if (v === undefined) return new Date().toISOString();
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new HttpError(400, 'invalid date');
  return new Date(v).toISOString();
};

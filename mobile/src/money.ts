// Money helpers. Amounts are integer minor units everywhere (same as the API).

export interface Portion {
  userId: string;
  amount: number;
}

export type SplitType = 'equal' | 'exact' | 'percent' | 'shares';

const DECIMALS: Record<string, number> = { JPY: 0, KRW: 0, VND: 0, KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3 };
export const decimals = (currency: string) => DECIMALS[currency] ?? 2;

export const CURRENCIES = ['AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'USD', 'EUR', 'GBP', 'INR'];

export function format(minor: number, currency: string): string {
  const d = decimals(currency);
  const value = minor / 10 ** d;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
  } catch {
    return `${currency} ${value.toFixed(d)}`;
  }
}

/** Parses user input like "12.5" into minor units. Returns null if invalid. */
export function parse(input: string, currency: string): number | null {
  const s = input.replace(/,/g, '').trim();
  if (!/^\d+(\.\d*)?$/.test(s) && !/^\.\d+$/.test(s)) return null;
  const d = decimals(currency);
  const [whole, frac = ''] = s.split('.');
  if (frac.length > d) return null;
  return Number(whole || '0') * 10 ** d + Number((frac + '0'.repeat(d)).slice(0, d) || '0');
}

/** Distributes `total` across integer weights, handing leftover units to the largest remainders. */
function byWeights(total: number, ids: string[], weights: number[]): Portion[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    base[i]++;
    left--;
  }
  return ids.map((userId, i) => ({ userId, amount: base[i] }));
}

export type SplitResult = { ok: true; shares: Portion[] } | { ok: false; error: string };

/**
 * Computes each person's share.
 * `inputs` (per user) are ignored for equal; money strings for exact; percentages for percent; weights for shares.
 */
export function computeShares(
  total: number,
  currency: string,
  type: SplitType,
  people: string[],
  inputs: Record<string, string>,
): SplitResult {
  if (total <= 0) return { ok: false, error: 'Enter an amount' };
  if (people.length === 0) return { ok: false, error: 'Choose at least one person' };

  if (type === 'equal') return { ok: true, shares: byWeights(total, people, people.map(() => 1)) };

  if (type === 'exact') {
    const amounts = people.map((p) => parse(inputs[p] || '0', currency));
    if (amounts.some((a) => a === null)) return { ok: false, error: 'Check the amounts' };
    const sum = (amounts as number[]).reduce((a, b) => a + b, 0);
    if (sum !== total) return { ok: false, error: `${format(total - sum, currency)} left to assign` };
    return { ok: true, shares: people.map((userId, i) => ({ userId, amount: amounts[i]! })) };
  }

  const nums = people.map((p) => Number((inputs[p] || '0').trim()));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return { ok: false, error: 'Check the values' };

  if (type === 'percent') {
    const sum = nums.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 1e-9) return { ok: false, error: `Percentages add up to ${+sum.toFixed(2)}%, not 100%` };
    // scale to basis points so decimals like 33.33 are honoured exactly
    return { ok: true, shares: byWeights(total, people, nums.map((n) => Math.round(n * 100))) };
  }

  // shares
  if (nums.some((n) => !Number.isInteger(n))) return { ok: false, error: 'Shares must be whole numbers' };
  if (nums.reduce((a, b) => a + b, 0) === 0) return { ok: false, error: 'Give at least one share' };
  return { ok: true, shares: byWeights(total, people, nums) };
}

/** Sums a per-currency record into display lines, e.g. ["AED 120.00", "USD 5.00"]. */
export const lines = (rec: Record<string, number>, abs = true) =>
  Object.entries(rec).map(([c, v]) => format(abs ? Math.abs(v) : v, c));

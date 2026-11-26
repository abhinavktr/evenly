import type { Debt, ExpenseDoc } from './types.js';

/** Net position of each user in one expense: positive = is owed, negative = owes. */
export function netOf(expense: Pick<ExpenseDoc, 'paidBy' | 'shares'>): Map<string, number> {
  const net = new Map<string, number>();
  for (const p of expense.paidBy) net.set(p.userId, (net.get(p.userId) ?? 0) + p.amount);
  for (const s of expense.shares) net.set(s.userId, (net.get(s.userId) ?? 0) - s.amount);
  return net;
}

/**
 * Turns a net map into directed debts by matching debtors to creditors.
 * Deterministic (sorted by amount, then id) so the same input always yields the same edges.
 * For a single payer this is exact: everyone owes the payer their share.
 */
export function settleNet(net: Map<string, number>, currency: string): Debt[] {
  const creditors: { id: string; amt: number }[] = [];
  const debtors: { id: string; amt: number }[] = [];
  for (const [id, v] of net) {
    if (v > 0) creditors.push({ id, amt: v });
    else if (v < 0) debtors.push({ id, amt: -v });
  }
  const order = (a: { id: string; amt: number }, b: { id: string; amt: number }) =>
    b.amt - a.amt || a.id.localeCompare(b.id);
  creditors.sort(order);
  debtors.sort(order);

  const debts: Debt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) debts.push({ from: debtors[i].id, to: creditors[j].id, amount: pay, currency });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return debts;
}

/** Per-currency net totals for every user across a set of expenses. */
export function netTotals(expenses: ExpenseDoc[]): Map<string, Map<string, number>> {
  const byCurrency = new Map<string, Map<string, number>>();
  for (const e of expenses) {
    if (e.deleted) continue;
    const m = byCurrency.get(e.currency) ?? new Map<string, number>();
    for (const [u, v] of netOf(e)) m.set(u, (m.get(u) ?? 0) + v);
    byCurrency.set(e.currency, m);
  }
  return byCurrency;
}

/** Minimal set of payments that clears a group ("simplify debts"). */
export function simplifyDebts(expenses: ExpenseDoc[]): Debt[] {
  const out: Debt[] = [];
  for (const [currency, net] of netTotals(expenses)) out.push(...settleNet(net, currency));
  return out;
}

/**
 * Pairwise balance between `me` and every other user, per currency, across all expenses.
 * Positive = they owe me; negative = I owe them.
 * Each expense is resolved into edges independently, so balances with a friend
 * are not distorted by unrelated third parties (matches how the app reports friend balances).
 */
export function pairwiseBalances(me: string, expenses: ExpenseDoc[]): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>();
  const add = (other: string, currency: string, v: number) => {
    const rec = result.get(other) ?? {};
    rec[currency] = (rec[currency] ?? 0) + v;
    result.set(other, rec);
  };
  for (const e of expenses) {
    if (e.deleted) continue;
    for (const d of settleNet(netOf(e), e.currency)) {
      if (d.to === me) add(d.from, d.currency, d.amount);
      else if (d.from === me) add(d.to, d.currency, -d.amount);
    }
  }
  // drop settled-to-zero currencies
  for (const [k, rec] of result) {
    for (const c of Object.keys(rec)) if (rec[c] === 0) delete rec[c];
    if (Object.keys(rec).length === 0) result.delete(k);
  }
  return result;
}

/** Sum of a user's net position per currency. */
export function myTotals(me: string, expenses: ExpenseDoc[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [currency, net] of netTotals(expenses)) {
    const v = net.get(me) ?? 0;
    if (v !== 0) out[currency] = v;
  }
  return out;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { myTotals, pairwiseBalances, simplifyDebts } from '../src/lib/balances.js';
import type { ExpenseDoc, Portion } from '../src/lib/types.js';

let n = 0;
const exp = (paidBy: Portion[], shares: Portion[], extra: Partial<ExpenseDoc> = {}): ExpenseDoc => ({
  id: String(++n), kind: 'expense', groupId: 'g', description: 'x',
  amount: paidBy.reduce((a, p) => a + p.amount, 0), currency: 'AED', date: '2026-01-01', splitType: 'equal',
  paidBy, shares, participantIds: [...new Set([...paidBy, ...shares].map((p) => p.userId))],
  createdBy: 'a', createdAt: '', updatedAt: '', ...extra,
});
const p = (userId: string, amount: number): Portion => ({ userId, amount });

test('single payer: everyone owes the payer their share', () => {
  const e = exp([p('a', 9000)], [p('a', 3000), p('b', 3000), p('c', 3000)]);
  const bal = pairwiseBalances('a', [e]);
  assert.deepEqual(bal.get('b'), { AED: 3000 });
  assert.deepEqual(bal.get('c'), { AED: 3000 });
  assert.deepEqual(pairwiseBalances('b', [e]).get('a'), { AED: -3000 });
  assert.equal(pairwiseBalances('b', [e]).get('c'), undefined);
});

test('payment settles a balance to zero', () => {
  const e = exp([p('a', 1000)], [p('a', 500), p('b', 500)]);
  const pay = exp([p('b', 500)], [p('a', 500)], { kind: 'payment' });
  assert.equal(pairwiseBalances('a', [e, pay]).size, 0);
  assert.deepEqual(myTotals('a', [e, pay]), {});
});

test('deleted expenses are ignored', () => {
  const e = exp([p('a', 1000)], [p('b', 1000)], { deleted: true });
  assert.equal(pairwiseBalances('a', [e]).size, 0);
});

test('currencies are kept separate', () => {
  const e1 = exp([p('a', 1000)], [p('b', 1000)]);
  const e2 = exp([p('b', 400)], [p('a', 400)], { currency: 'USD' });
  assert.deepEqual(pairwiseBalances('a', [e1, e2]).get('b'), { AED: 1000, USD: -400 });
});

test('simplify debts: chain a→b→c collapses to a→c', () => {
  const e1 = exp([p('b', 1000)], [p('a', 1000)]); // a owes b 10
  const e2 = exp([p('c', 1000)], [p('b', 1000)]); // b owes c 10
  assert.deepEqual(simplifyDebts([e1, e2]), [{ from: 'a', to: 'c', amount: 1000, currency: 'AED' }]);
});

test('simplified debts conserve money', () => {
  const es = [
    exp([p('a', 12000)], [p('a', 3000), p('b', 3000), p('c', 3000), p('d', 3000)]),
    exp([p('b', 4500)], [p('a', 1500), p('c', 1500), p('d', 1500)]),
    exp([p('c', 1001), p('d', 999)], [p('a', 667), p('b', 667), p('c', 666)]),
  ];
  const debts = simplifyDebts(es);
  const net = new Map<string, number>();
  for (const d of debts) {
    net.set(d.from, (net.get(d.from) ?? 0) - d.amount);
    net.set(d.to, (net.get(d.to) ?? 0) + d.amount);
  }
  for (const u of ['a', 'b', 'c', 'd']) assert.equal(net.get(u) ?? 0, myTotals(u, es).AED ?? 0, u);
  assert.ok(debts.length <= 3);
});

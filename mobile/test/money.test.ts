import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeShares, parse } from '../src/money.ts';

const sum = (r: any) => r.shares.reduce((a: number, s: any) => a + s.amount, 0);

test('parse handles decimals per currency', () => {
  assert.equal(parse('12.5', 'AED'), 1250);
  assert.equal(parse('0.05', 'AED'), 5);
  assert.equal(parse('1,234.56', 'USD'), 123456);
  assert.equal(parse('1.234', 'KWD'), 1234);
  assert.equal(parse('1.234', 'AED'), null);
  assert.equal(parse('abc', 'AED'), null);
  assert.equal(parse('500', 'JPY'), 500);
});

test('equal split distributes remainder and sums to total', () => {
  const r = computeShares(1000, 'AED', 'equal', ['a', 'b', 'c'], {});
  assert.ok(r.ok);
  assert.equal(sum(r), 1000);
  assert.deepEqual(r.shares.map((s) => s.amount), [334, 333, 333]);
});

test('exact split must add up', () => {
  assert.equal(computeShares(1000, 'AED', 'exact', ['a', 'b'], { a: '4', b: '5' }).ok, false);
  const r = computeShares(1000, 'AED', 'exact', ['a', 'b'], { a: '4', b: '6' });
  assert.ok(r.ok);
  assert.deepEqual(r.shares.map((s) => s.amount), [400, 600]);
});

test('percent split with thirds', () => {
  const r = computeShares(10000, 'AED', 'percent', ['a', 'b', 'c'], { a: '33.34', b: '33.33', c: '33.33' });
  assert.ok(r.ok);
  assert.equal(sum(r), 10000);
  assert.equal(computeShares(10000, 'AED', 'percent', ['a', 'b'], { a: '50', b: '40' }).ok, false);
});

test('shares split by weights', () => {
  const r = computeShares(900, 'AED', 'shares', ['a', 'b'], { a: '2', b: '1' });
  assert.ok(r.ok);
  assert.deepEqual(r.shares.map((s) => s.amount), [600, 300]);
  const odd = computeShares(1001, 'AED', 'shares', ['a', 'b', 'c'], { a: '1', b: '1', c: '1' });
  assert.ok(odd.ok);
  assert.equal(sum(odd), 1001);
});

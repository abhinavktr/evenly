// End-to-end test of the HTTP handlers with an in-memory stand-in for Cosmos DB and dev auth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '@azure/functions';

process.env.AUTH_MODE = 'dev';
delete process.env.WEBSITE_INSTANCE_ID;

type Doc = Record<string, any>;
const registry: Record<string, { methods: string[]; route: string; handler: Function }> = {};
(app as any).http = (name: string, opts: any) => { registry[name] = opts; };

function fakeContainer(name: string) {
  const store = new Map<string, Doc>();
  const clone = (d: Doc) => structuredClone(d);
  const notDeleted = (d: Doc) => !d.deleted;
  return {
    store,
    item: (id: string) => ({
      read: async () => ({ resource: store.has(id) ? clone(store.get(id)!) : undefined }),
      patch: async (ops: any[]) => {
        const d = store.get(id);
        if (!d) throw Object.assign(new Error('nf'), { code: 404 });
        for (const op of ops) {
          const key = op.path.split('/')[1];
          if (op.path.endsWith('/-')) d[key].push(op.value);
          else d[key] = op.value;
        }
      },
    }),
    items: {
      create: async (d: Doc) => {
        if (store.has(d.id)) throw Object.assign(new Error('conflict'), { code: 409 });
        store.set(d.id, clone(d));
      },
      upsert: async (d: Doc) => { store.set(d.id, clone(d)); },
      query: (q: { query: string; parameters: { name: string; value: any }[] }) => ({
        fetchAll: async () => {
          const p = Object.fromEntries(q.parameters.map((x) => [x.name, x.value]));
          let all = [...store.values()];
          const s = q.query;
          if (s.includes('ARRAY_CONTAINS(@ids, c.id)')) all = all.filter((d) => p['@ids'].includes(d.id));
          else if (s.includes('ARRAY_CONTAINS(c.memberIds, @u)')) all = all.filter((d) => d.memberIds.includes(p['@u']));
          else if (s.includes('TOP @limit')) all = all.filter((d) => d.participantIds.includes(p['@u']) || p['@groups'].includes(d.groupId));
          else if (s.includes('c.groupId = @g')) all = all.filter((d) => d.groupId === p['@g'] && (!s.includes('deleted') || notDeleted(d)));
          else if (s.includes('ARRAY_CONTAINS(c.participantIds, @u)')) all = all.filter((d) => d.participantIds.includes(p['@u']) && notDeleted(d));
          else throw new Error(`unmocked query in ${name}: ${s}`);
          return { resources: all.map(clone) };
        },
      }),
    },
  };
}

const containers = { users: fakeContainer('users'), groups: fakeContainer('groups'), expenses: fakeContainer('expenses') };

const db = await import('../src/lib/db.js');
db.__setTestContainers(containers as any);
await import('../src/functions/me.js');
await import('../src/functions/friends.js');
await import('../src/functions/groups.js');
await import('../src/functions/expenses.js');
await import('../src/functions/summary.js');

/** Calls a route like a Functions request would. */
async function call(user: string, method: string, path: string, body?: unknown) {
  for (const opts of Object.values(registry)) {
    if (!opts.methods.includes(method)) continue;
    const names: string[] = [];
    const re = new RegExp('^' + opts.route.replace(/\{(\w+)\}/g, (_: string, n: string) => (names.push(n), '([^/]+)')) + '$');
    const m = path.split('?')[0].match(re);
    if (!m) continue;
    const params = Object.fromEntries(names.map((n, i) => [n, m[i + 1]]));
    const req = {
      params,
      headers: new Headers({ 'x-dev-user': user }),
      query: new URLSearchParams(path.split('?')[1] ?? ''),
      json: async () => body,
    };
    const ctx = { error: (...a: unknown[]) => console.error(...a), log: () => {} };
    const res = await opts.handler(req, ctx);
    return { status: res.status as number, body: res.jsonBody };
  }
  throw new Error(`no route for ${method} ${path}`);
}

const A = 'abhi@example.com', B = 'bea@example.com', C = 'chen@example.com';

test('full flow: invite, group, expenses, balances, settle, activity', async () => {
  assert.equal((await call(A, 'GET', 'me')).status, 200);

  // invite B (no account yet) as a friend
  const fr = await call(A, 'POST', 'friends', { email: 'Bea@Example.com', name: 'Bea' });
  assert.equal(fr.status, 201);
  assert.equal(fr.body.registered, false);

  // group with B and C (C invited via the group)
  const g = await call(A, 'POST', 'groups', { name: 'Trip', currency: 'AED', members: [{ email: B }, { email: C, name: 'Chen' }] });
  assert.equal(g.status, 201);
  const gid = g.body.id;

  // A pays 300 split three ways
  const e1 = await call(A, 'POST', 'expenses', {
    groupId: gid, description: 'Hotel', amount: 30000, currency: 'AED', splitType: 'equal',
    paidBy: [{ userId: A, amount: 30000 }], shares: [A, B, C].map((u) => ({ userId: u, amount: 10000 })),
  });
  assert.equal(e1.status, 201, JSON.stringify(e1.body));

  // B pays 90 for B and C
  const e2 = await call(B, 'POST', 'expenses', {
    groupId: gid, description: 'Fuel', amount: 9000, currency: 'AED',
    paidBy: [{ userId: B, amount: 9000 }], shares: [{ userId: B, amount: 4500 }, { userId: C, amount: 4500 }],
  });
  assert.equal(e2.status, 201, JSON.stringify(e2.body));

  // shares that don't add up are rejected
  const bad = await call(A, 'POST', 'expenses', { groupId: gid, description: 'x', amount: 100, currency: 'AED', paidBy: [{ userId: A, amount: 100 }], shares: [{ userId: B, amount: 99 }] });
  assert.equal(bad.status, 400);

  // outsiders can't see the group
  assert.equal((await call('eve@example.com', 'GET', `groups/${gid}`)).status, 404);

  const gd = await call(A, 'GET', `groups/${gid}`);
  const bal = Object.fromEntries(gd.body.members.map((m: any) => [m.id, m.balance.AED ?? 0]));
  assert.deepEqual(bal, { [A]: 20000, [B]: -5500, [C]: -14500 });
  const owedToA = gd.body.simplifiedDebts.filter((d: any) => d.to === A).reduce((s: number, d: any) => s + d.amount, 0);
  assert.equal(owedToA, 20000);

  const summary = await call(A, 'GET', 'balances');
  assert.deepEqual(summary.body.youAreOwed, { AED: 20000 });

  const friends = await call(A, 'GET', 'friends');
  assert.deepEqual(Object.fromEntries(friends.body.map((f: any) => [f.id, f.balance.AED])), { [B]: 10000, [C]: 10000 });

  // B signs up later and claims the invited account
  const bMe = await call(B, 'GET', 'me');
  assert.equal(bMe.body.registered, true);
  assert.equal(bMe.body.name, 'Bea');

  // B settles 100 with A
  const s = await call(B, 'POST', 'settlements', { from: B, to: A, amount: 10000, currency: 'AED', groupId: gid });
  assert.equal(s.status, 201);
  const fB = await call(A, 'GET', `friends/${encodeURIComponent(B)}`);
  assert.deepEqual(fB.body.balance, {});

  // edit then delete the fuel expense
  const upd = await call(B, 'PUT', `expenses/${e2.body.id}`, { ...e2.body, amount: 10000, paidBy: [{ userId: B, amount: 10000 }], shares: [{ userId: B, amount: 5000 }, { userId: C, amount: 5000 }] });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal((await call(C, 'DELETE', `expenses/${e2.body.id}`)).status, 204);
  const after = await call(C, 'GET', `groups/${gid}`);
  assert.equal(after.body.members.find((m: any) => m.id === C).balance.AED, -10000);

  // activity shows the deletion first
  const act = await call(A, 'GET', 'activity');
  assert.ok(act.body.some((x: any) => x.deleted && x.description === 'Fuel'));

  // can't remove C while they owe money
  assert.equal((await call(A, 'DELETE', `groups/${gid}/members/${encodeURIComponent(C)}`)).status, 409);

  // new expenses must belong to a group, even between friends
  const noGroup = await call(A, 'POST', 'expenses', { description: 'x', amount: 100, currency: 'AED', paidBy: [{ userId: A, amount: 100 }], shares: [{ userId: B, amount: 100 }] });
  assert.equal(noGroup.status, 400);
  assert.match(noGroup.body.error, /group/);

  // non-group expense with a non-friend is refused
  const stranger = await call(A, 'POST', 'expenses', { description: 'x', amount: 100, currency: 'AED', paidBy: [{ userId: A, amount: 100 }], shares: [{ userId: 'zed@example.com', amount: 100 }] });
  assert.equal(stranger.status, 400);
});

test('missing dev header is 401', async () => {
  const res = await call('', 'GET', 'me');
  assert.equal(res.status, 401);
});

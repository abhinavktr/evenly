import { app } from '@azure/functions';
import { route } from '../lib/http.js';
import { expenses, getUsers, myExpenses, myGroups, publicUser } from '../lib/db.js';
import { myTotals, pairwiseBalances } from '../lib/balances.js';
import type { ExpenseDoc } from '../lib/types.js';

// GET /api/balances — dashboard totals: what I'm owed / what I owe, per currency
app.http('balances', {
  methods: ['GET'],
  route: 'balances',
  handler: route(async ({ user }) => {
    const all = await myExpenses(user.id);
    const pairs = pairwiseBalances(user.id, all);
    const owed: Record<string, number> = {};
    const owe: Record<string, number> = {};
    for (const rec of pairs.values())
      for (const [cur, v] of Object.entries(rec)) {
        if (v > 0) owed[cur] = (owed[cur] ?? 0) + v;
        else owe[cur] = (owe[cur] ?? 0) - v;
      }
    return { net: myTotals(user.id, all), youAreOwed: owed, youOwe: owe };
  }),
});

// GET /api/activity?limit=50 — newest expenses/payments/deletions touching me or my groups
app.http('activity', {
  methods: ['GET'],
  route: 'activity',
  handler: route(async ({ user, req }) => {
    const limit = Math.min(Number(req.query.get('limit')) || 50, 200);
    const groupIds = (await myGroups(user.id)).map((g) => g.id);
    const { resources } = await expenses()
      .items.query<ExpenseDoc>({
        query: `SELECT TOP @limit * FROM c
                WHERE ARRAY_CONTAINS(c.participantIds, @u) OR ARRAY_CONTAINS(@groups, c.groupId)
                ORDER BY c.updatedAt DESC`,
        parameters: [{ name: '@u', value: user.id }, { name: '@groups', value: groupIds }, { name: '@limit', value: limit }],
      })
      .fetchAll();
    const people = await getUsers(resources.flatMap((e) => [e.createdBy, e.deletedBy ?? e.createdBy]));
    const names = Object.fromEntries(people.map((p) => [p.id, publicUser(p).name]));
    return resources.map((e) => {
      // my effect on this item: + I lent, − I borrowed
      const mine = e.deleted ? 0 : (myTotals(user.id, [e])[e.currency] ?? 0);
      return { ...e, myEffect: mine, actorName: names[e.deletedBy ?? e.createdBy] ?? e.createdBy };
    });
  }),
});

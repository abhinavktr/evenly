import { app } from '@azure/functions';
import { randomUUID } from 'node:crypto';
import { HttpError, route } from '../lib/http.js';
import {
  befriend, ensureUser, getUser, getUsers, groupExpenses, groups, myExpenses, myGroups, now, publicUser, requireGroupMember,
} from '../lib/db.js';
import { currency, normEmail, str } from '../lib/validate.js';
import { myTotals, netTotals, simplifyDebts } from '../lib/balances.js';
import type { GroupDoc } from '../lib/types.js';

// GET /api/groups — my groups with my net position in each
app.http('groups-list', {
  methods: ['GET'],
  route: 'groups',
  handler: route(async ({ user }) => {
    const [gs, expenses] = await Promise.all([myGroups(user.id), myExpenses(user.id)]);
    return gs.map((g) => ({
      ...g,
      myBalance: myTotals(user.id, expenses.filter((e) => e.groupId === g.id)),
    }));
  }),
});

// POST /api/groups { name, currency, members: [{ email, name? }] }
app.http('groups-create', {
  methods: ['POST'],
  route: 'groups',
  handler: route(async ({ user, body }) => {
    const b = await body();
    if (!(await getUser(user.id))) throw new HttpError(409, 'call GET /me first');
    const members: { email: string; name?: string }[] = Array.isArray(b.members) ? b.members : [];
    if (members.length > 100) throw new HttpError(400, 'too many members');
    const ids = new Set([user.id]);
    for (const m of members) {
      const u = await ensureUser(normEmail(m.email), m.name, user.id);
      ids.add(u.id);
    }
    const t = now();
    const g: GroupDoc = {
      id: randomUUID(), name: str(b.name, 'name', 80), currency: currency(b.currency ?? 'AED'),
      memberIds: [...ids], createdBy: user.id, createdAt: t, updatedAt: t,
    };
    await groups().items.create(g);
    for (const id of ids) if (id !== user.id) await befriend(user.id, id);
    return g;
  }, 201),
});

// GET /api/groups/{id} — group, members, balances, suggested settle-up payments, expenses
app.http('groups-get', {
  methods: ['GET'],
  route: 'groups/{id}',
  handler: route(async ({ user, req }) => {
    const g = await requireGroupMember(req.params.id, user.id);
    const [members, expenses] = await Promise.all([getUsers(g.memberIds), groupExpenses(g.id)]);
    const totals = netTotals(expenses);
    const memberBalances = members.map((m) => {
      const bal: Record<string, number> = {};
      for (const [cur, net] of totals) { const v = net.get(m.id) ?? 0; if (v) bal[cur] = v; }
      return { ...publicUser(m), balance: bal };
    });
    return { group: g, members: memberBalances, simplifiedDebts: simplifyDebts(expenses), expenses };
  }),
});

// PATCH /api/groups/{id} { name?, currency? }
app.http('groups-update', {
  methods: ['PATCH'],
  route: 'groups/{id}',
  handler: route(async ({ user, req, body }) => {
    const g = await requireGroupMember(req.params.id, user.id);
    const b = await body();
    const next = { ...g, updatedAt: now() };
    if (b.name !== undefined) next.name = str(b.name, 'name', 80);
    if (b.currency !== undefined) next.currency = currency(b.currency);
    await groups().items.upsert(next);
    return next;
  }),
});

// POST /api/groups/{id}/members { email, name? }
app.http('groups-add-member', {
  methods: ['POST'],
  route: 'groups/{id}/members',
  handler: route(async ({ user, req, body }) => {
    const g = await requireGroupMember(req.params.id, user.id);
    const b = await body();
    const u = await ensureUser(normEmail(b.email), b.name, user.id);
    if (!g.memberIds.includes(u.id)) {
      await groups().item(g.id, g.id).patch([
        { op: 'add', path: '/memberIds/-', value: u.id },
        { op: 'set', path: '/updatedAt', value: now() },
      ]);
    }
    await befriend(user.id, u.id);
    return publicUser(u);
  }, 201),
});

// DELETE /api/groups/{id}/members/{userId} — leave/remove, only if their balance is settled
app.http('groups-remove-member', {
  methods: ['DELETE'],
  route: 'groups/{id}/members/{userId}',
  handler: route(async ({ user, req }) => {
    const g = await requireGroupMember(req.params.id, user.id);
    const target = normEmail(decodeURIComponent(req.params.userId));
    if (!g.memberIds.includes(target)) throw new HttpError(404, 'not a member');
    const bal = myTotals(target, await groupExpenses(g.id));
    if (Object.keys(bal).length) throw new HttpError(409, 'member has an unsettled balance in this group');
    await groups().items.upsert({ ...g, memberIds: g.memberIds.filter((m) => m !== target), updatedAt: now() });
    return undefined;
  }),
});

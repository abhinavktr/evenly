import { app } from '@azure/functions';
import { randomUUID } from 'node:crypto';
import { HttpError, route } from '../lib/http.js';
import { expenses, getExpense, getGroup, getUser, groups, now, requireGroupMember } from '../lib/db.js';
import { currency, isoDate, normEmail, portions, positiveInt, splitType, str } from '../lib/validate.js';
import type { ExpenseDoc, GroupDoc } from '../lib/types.js';

/** Checks every participant is allowed: group members for group expenses, me + my friends otherwise. */
async function checkParticipants(me: string, groupId: string | null, participantIds: string[]): Promise<GroupDoc | null> {
  if (groupId) {
    const g = await requireGroupMember(groupId, me);
    const outsiders = participantIds.filter((p) => !g.memberIds.includes(p));
    if (outsiders.length) throw new HttpError(400, `not in this group: ${outsiders.join(', ')}`);
    return g;
  }
  if (!participantIds.includes(me)) throw new HttpError(400, 'non-group expenses must include you');
  const meDoc = await getUser(me);
  const strangers = participantIds.filter((p) => p !== me && !meDoc?.friendIds.includes(p));
  if (strangers.length) throw new HttpError(400, `add these people as friends first: ${strangers.join(', ')}`);
  return null;
}

/** Anyone involved in the expense, or any member of its group, may view or edit it. */
async function requireAccess(id: string, me: string): Promise<ExpenseDoc> {
  const e = await getExpense(id);
  if (!e) throw new HttpError(404, 'expense not found');
  if (e.participantIds.includes(me)) return e;
  if (e.groupId) {
    const g = await getGroup(e.groupId);
    if (g?.memberIds.includes(me)) return e;
  }
  throw new HttpError(404, 'expense not found');
}

const touchGroup = async (g: GroupDoc | null) => {
  if (g) await groups().item(g.id, g.id).patch([{ op: 'set', path: '/updatedAt', value: now() }]);
};

function parseExpense(b: any) {
  const amount = positiveInt(b.amount, 'amount');
  const paidBy = portions(b.paidBy, 'paidBy', amount);
  const shares = portions(b.shares, 'shares', amount, true);
  return {
    groupId: b.groupId ? String(b.groupId) : null,
    description: str(b.description, 'description', 120),
    amount,
    currency: currency(b.currency),
    date: isoDate(b.date),
    splitType: splitType(b.splitType),
    paidBy,
    shares,
    participantIds: [...new Set([...paidBy, ...shares].map((p) => p.userId))],
    notes: typeof b.notes === 'string' ? b.notes.slice(0, 1000) : undefined,
  };
}

// POST /api/expenses
// { groupId?, description, amount, currency, date?, splitType, paidBy:[{userId,amount}], shares:[{userId,amount}], notes? }
app.http('expenses-create', {
  methods: ['POST'],
  route: 'expenses',
  handler: route(async ({ user, body }) => {
    const p = parseExpense(await body());
    if (!p.groupId) throw new HttpError(400, 'Choose a group for this expense');
    const g = await checkParticipants(user.id, p.groupId, p.participantIds);
    const t = now();
    const doc: ExpenseDoc = { id: randomUUID(), kind: 'expense', ...p, createdBy: user.id, createdAt: t, updatedAt: t };
    await expenses().items.create(doc);
    await touchGroup(g);
    return doc;
  }, 201),
});

app.http('expenses-get', {
  methods: ['GET'],
  route: 'expenses/{id}',
  handler: route(async ({ user, req }) => requireAccess(req.params.id, user.id)),
});

// PUT /api/expenses/{id} — full replacement of the editable fields (group can't change)
app.http('expenses-update', {
  methods: ['PUT'],
  route: 'expenses/{id}',
  handler: route(async ({ user, req, body }) => {
    const existing = await requireAccess(req.params.id, user.id);
    if (existing.deleted) throw new HttpError(409, 'expense is deleted');
    if (existing.kind !== 'expense') throw new HttpError(400, 'use the settlements endpoints for payments');
    const p = parseExpense({ ...(await body()), groupId: existing.groupId });
    const g = await checkParticipants(user.id, p.groupId, p.participantIds);
    const doc: ExpenseDoc = { ...existing, ...p, updatedAt: now() };
    await expenses().items.upsert(doc);
    await touchGroup(g);
    return doc;
  }),
});

// DELETE /api/expenses/{id} — soft delete so it still shows in activity
app.http('expenses-delete', {
  methods: ['DELETE'],
  route: 'expenses/{id}',
  handler: route(async ({ user, req }) => {
    const e = await requireAccess(req.params.id, user.id);
    await expenses().items.upsert({ ...e, deleted: true, deletedBy: user.id, updatedAt: now() });
    return undefined;
  }),
});

// POST /api/settlements { from, to, amount, currency, groupId?, date? } — "settle up" payment
app.http('settlements-create', {
  methods: ['POST'],
  route: 'settlements',
  handler: route(async ({ user, body }) => {
    const b = await body();
    const from = normEmail(b.from);
    const to = normEmail(b.to);
    if (from === to) throw new HttpError(400, 'from and to must differ');
    const amount = positiveInt(b.amount, 'amount');
    const groupId = b.groupId ? String(b.groupId) : null;
    if (!groupId && from !== user.id && to !== user.id) throw new HttpError(400, 'you must be the payer or the recipient');
    const g = await checkParticipants(user.id, groupId, [from, to]);
    const t = now();
    const doc: ExpenseDoc = {
      id: randomUUID(), kind: 'payment', groupId, description: 'Payment', amount, currency: currency(b.currency),
      date: isoDate(b.date), splitType: 'exact', paidBy: [{ userId: from, amount }], shares: [{ userId: to, amount }],
      participantIds: [from, to], createdBy: user.id, createdAt: t, updatedAt: t,
    };
    await expenses().items.create(doc);
    await touchGroup(g);
    return doc;
  }, 201),
});

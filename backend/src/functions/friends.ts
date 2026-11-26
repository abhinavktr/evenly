import { app } from '@azure/functions';
import { HttpError, route } from '../lib/http.js';
import { befriend, ensureUser, getUser, getUsers, myExpenses, publicUser } from '../lib/db.js';
import { normEmail } from '../lib/validate.js';
import { pairwiseBalances } from '../lib/balances.js';

// GET /api/friends — friends with what they owe me (+) or I owe them (−), per currency
app.http('friends-list', {
  methods: ['GET'],
  route: 'friends',
  handler: route(async ({ user }) => {
    const me = await getUser(user.id);
    const expenses = await myExpenses(user.id);
    const balances = pairwiseBalances(user.id, expenses);
    // people I share balances with (e.g. via a group) show up even if not explicitly friends
    const ids = new Set([...(me?.friendIds ?? []), ...balances.keys()]);
    const people = await getUsers([...ids]);
    return people
      .map((p) => ({ ...publicUser(p), balance: balances.get(p.id) ?? {} }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
});

// POST /api/friends { email, name? } — adds a friend, inviting them if they have no account yet
app.http('friends-add', {
  methods: ['POST'],
  route: 'friends',
  handler: route(async ({ user, body }) => {
    const b = await body();
    const email = normEmail(b.email);
    if (email === user.id) throw new HttpError(400, "you can't add yourself");
    if (!(await getUser(user.id))) throw new HttpError(409, 'call GET /me first');
    const friend = await ensureUser(email, b.name, user.id);
    await befriend(user.id, friend.id);
    return publicUser(friend);
  }, 201),
});

// GET /api/friends/{id} — one friend, our balance, and expenses we share
app.http('friends-get', {
  methods: ['GET'],
  route: 'friends/{id}',
  handler: route(async ({ user, req }) => {
    const id = normEmail(decodeURIComponent(req.params.id));
    const friend = await getUser(id);
    if (!friend) throw new HttpError(404, 'friend not found');
    const all = await myExpenses(user.id);
    const shared = all.filter((e) => e.participantIds.includes(id));
    const balance = pairwiseBalances(user.id, shared).get(id) ?? {};
    if (!friend.friendIds.includes(user.id) && shared.length === 0) throw new HttpError(404, 'friend not found');
    shared.sort((a, b) => b.date.localeCompare(a.date));
    return { friend: publicUser(friend), balance, expenses: shared };
  }),
});

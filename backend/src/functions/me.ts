import { app } from '@azure/functions';
import { HttpError, route } from '../lib/http.js';
import { getUser, now, users } from '../lib/db.js';
import { currency, str } from '../lib/validate.js';
import type { UserDoc } from '../lib/types.js';

// GET /api/me — signs the user in: creates their profile, or claims an invited placeholder.
app.http('me-get', {
  methods: ['GET'],
  route: 'me',
  handler: route(async ({ user }) => {
    const existing = await getUser(user.id);
    const t = now();
    if (!existing) {
      const doc: UserDoc = {
        id: user.id, email: user.email, name: user.name, oid: user.oid, registered: true,
        defaultCurrency: 'AED', friendIds: [], createdAt: t, updatedAt: t,
      };
      await users().items.upsert(doc);
      return doc;
    }
    if (!existing.registered || existing.oid !== user.oid) {
      const patched = { ...existing, registered: true, oid: user.oid, updatedAt: t };
      await users().items.upsert(patched);
      return patched;
    }
    return existing;
  }),
});

// PATCH /api/me — update name / default currency
app.http('me-patch', {
  methods: ['PATCH'],
  route: 'me',
  handler: route(async ({ user, body }) => {
    const b = await body();
    const existing = await getUser(user.id);
    if (!existing) throw new HttpError(409, 'call GET /me first');
    const next = { ...existing, updatedAt: now() };
    if (b.name !== undefined) next.name = str(b.name, 'name', 80);
    if (b.defaultCurrency !== undefined) next.defaultCurrency = currency(b.defaultCurrency);
    await users().items.upsert(next);
    return next;
  }),
});

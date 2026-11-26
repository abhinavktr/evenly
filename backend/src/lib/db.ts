import { DefaultAzureCredential } from '@azure/identity';
import { CosmosClient, type Container, type ItemDefinition } from '@azure/cosmos';
import { HttpError } from './http.js';
import type { ExpenseDoc, GroupDoc, UserDoc } from './types.js';

let client: CosmosClient | undefined;

function db() {
  // In Azure the Function App's managed identity is used (no keys); locally a key can be supplied.
  const endpoint = process.env.COSMOS_ENDPOINT!;
  client ??= process.env.COSMOS_KEY
    ? new CosmosClient({ endpoint, key: process.env.COSMOS_KEY })
    : new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
  return client.database(process.env.COSMOS_DATABASE ?? 'evenly');
}

/** Test hook: swap in in-memory containers. */
let testContainers: Record<string, Container> | undefined;
export const __setTestContainers = (c: Record<string, Container>) => { testContainers = c; };
const container = (name: string): Container => testContainers?.[name] ?? db().container(name);

// Every container is partitioned on /id (point reads by id; list queries fan out — fine at MVP scale).
export const users = (): Container => container('users');
export const groups = (): Container => container('groups');
export const expenses = (): Container => container('expenses');

export const now = () => new Date().toISOString();

async function read<T extends ItemDefinition>(c: Container, id: string): Promise<T | undefined> {
  try {
    const { resource } = await c.item(id, id).read<T>();
    return resource ?? undefined;
  } catch (e: any) {
    if (e?.code === 404) return undefined;
    throw e;
  }
}

export const getUser = (id: string) => read<UserDoc>(users(), id);
export const getGroup = (id: string) => read<GroupDoc>(groups(), id);
export const getExpense = (id: string) => read<ExpenseDoc>(expenses(), id);

export async function getUsers(ids: string[]): Promise<UserDoc[]> {
  if (ids.length === 0) return [];
  const { resources } = await users()
    .items.query<UserDoc>({ query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(@ids, c.id)', parameters: [{ name: '@ids', value: [...new Set(ids)] }] })
    .fetchAll();
  return resources;
}

/** Public-safe view of a user. */
export const publicUser = (u: UserDoc) => ({ id: u.id, email: u.email, name: u.name, registered: u.registered });

/** Finds a user by email or creates an invited placeholder they will claim on first sign-in. */
export async function ensureUser(email: string, name: string | undefined, invitedBy: string): Promise<UserDoc> {
  const existing = await getUser(email);
  if (existing) return existing;
  const t = now();
  const inviter = await getUser(invitedBy);
  const doc: UserDoc = {
    id: email,
    email,
    name: name?.trim() || email.split('@')[0],
    registered: false,
    defaultCurrency: inviter?.defaultCurrency ?? 'AED',
    friendIds: [],
    invitedBy,
    createdAt: t,
    updatedAt: t,
  };
  try {
    await users().items.create(doc);
    return doc;
  } catch (e: any) {
    if (e?.code === 409) return (await getUser(email))!; // created concurrently
    throw e;
  }
}

/** Makes two users friends (idempotent). */
export async function befriend(a: string, b: string) {
  if (a === b) return;
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const u = await getUser(x);
    if (u && !u.friendIds.includes(y)) {
      await users().item(x, x).patch([{ op: 'add', path: '/friendIds/-', value: y }, { op: 'set', path: '/updatedAt', value: now() }]);
    }
  }
}

export async function requireGroupMember(groupId: string, userId: string): Promise<GroupDoc> {
  const g = await getGroup(groupId);
  if (!g || !g.memberIds.includes(userId)) throw new HttpError(404, 'group not found');
  return g;
}

export async function myGroups(userId: string): Promise<GroupDoc[]> {
  const { resources } = await groups()
    .items.query<GroupDoc>({ query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(c.memberIds, @u) ORDER BY c.updatedAt DESC', parameters: [{ name: '@u', value: userId }] })
    .fetchAll();
  return resources;
}

/** All (non-deleted) expenses a user takes part in. */
export async function myExpenses(userId: string): Promise<ExpenseDoc[]> {
  const { resources } = await expenses()
    .items.query<ExpenseDoc>({
      query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(c.participantIds, @u) AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)',
      parameters: [{ name: '@u', value: userId }],
    })
    .fetchAll();
  return resources;
}

export async function groupExpenses(groupId: string, includeDeleted = false): Promise<ExpenseDoc[]> {
  const { resources } = await expenses()
    .items.query<ExpenseDoc>({
      query: `SELECT * FROM c WHERE c.groupId = @g ${includeDeleted ? '' : 'AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)'} ORDER BY c.date DESC`,
      parameters: [{ name: '@g', value: groupId }],
    })
    .fetchAll();
  return resources;
}

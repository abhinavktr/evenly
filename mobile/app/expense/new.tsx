import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useApi, useLoad, type Expense, type User } from '../../src/api';
import { useMe } from '../../src/me';
import { CURRENCIES, computeShares, decimals, format, parse, type SplitType } from '../../src/money';
import { Button, Card, Chip, ErrorText, Input, Loading, Row, Screen, Section, T, splitLabels, useTheme } from '../../src/ui';

interface Ctx {
  people: User[]; // who can be part of this expense
  groupId: string | null;
  groupName?: string;
  currency: string;
  existing?: Expense;
}

const toInput = (minor: number, currency: string) => (minor / 10 ** decimals(currency)).toFixed(decimals(currency));

/**
 * Add or edit an expense. Params: groupId? | friendId? | id? (edit)
 * New expenses always belong to a group: without a groupId the user first picks one or creates one.
 */
export default function ExpenseForm() {
  const params = useLocalSearchParams<{ groupId?: string; friendId?: string; id?: string }>();
  const friendId = params.friendId ? decodeURIComponent(params.friendId) : undefined;
  const [groupId, setGroupId] = useState(params.groupId);

  if (!params.id && !groupId) return <GroupPicker friendId={friendId} onPick={setGroupId} />;
  return <ExpenseLoader id={params.id} groupId={groupId} friendId={friendId} />;
}

function ExpenseLoader({ id, groupId: chosenGroup, friendId }: { id?: string; groupId?: string; friendId?: string }) {
  const api = useApi();
  const { me } = useMe();

  const ctx = useLoad<Ctx>(async () => {
    const existing = id ? await api.expense(id) : undefined;
    const groupId = existing?.groupId ?? chosenGroup ?? null;
    if (groupId) {
      const g = await api.group(groupId);
      return { people: g.members, groupId, groupName: g.group.name, currency: existing?.currency ?? g.group.currency, existing };
    }
    // only reachable when editing an older expense that was created without a group
    const friends = await api.friends();
    return { people: [me!, ...friends], groupId: null, currency: existing?.currency ?? me!.defaultCurrency ?? 'AED', existing };
  }, [id, chosenGroup]);

  if (!ctx.data || !me) return ctx.error ? <Screen><ErrorText error={ctx.error} /></Screen> : <Loading />;
  return <Form ctx={ctx.data} meId={me.id} friendId={friendId} />;
}

/** Step 1 for a new expense: choose an existing group or create one (pre-filled with the friend, if any). */
function GroupPicker({ friendId, onPick }: { friendId?: string; onPick: (groupId: string) => void }) {
  const api = useApi();
  const t = useTheme();
  const { me, nameOf } = useMe();
  const data = useLoad(async () => {
    const [groups, friends] = await Promise.all([api.groups(), api.friends()]);
    return { groups, friends };
  });
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(me?.defaultCurrency ?? 'AED');
  const [members, setMembers] = useState<string[]>(friendId ? [friendId] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!data.data) return data.error ? <Screen><ErrorText error={data.error} /></Screen> : <Loading />;
  const { groups, friends } = data.data;
  // groups that include the friend come first
  const sorted = friendId
    ? [...groups.filter((g) => g.memberIds.includes(friendId)), ...groups.filter((g) => !g.memberIds.includes(friendId))]
    : groups;
  const withFriend = friendId ? groups.filter((g) => g.memberIds.includes(friendId)).length : 0;
  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const create = async () => {
    setBusy(true); setError(undefined);
    try {
      const g = await api.createGroup({ name: name.trim(), currency, members: members.map((email) => ({ email })) });
      onPick(g.id);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Add expense' }} />
      <T muted>Every expense belongs to a group. Choose one{friendId ? ` with ${nameOf(friendId)}` : ''}, or create a new group.</T>

      {sorted.length > 0 && (
        <Section title="Choose a group">
          <Card>
            {sorted.map((g, i) => (
              <Row
                key={g.id}
                title={g.name}
                subtitle={`${g.memberIds.length} members · ${g.currency}${friendId && i < withFriend ? ` · with ${nameOf(friendId)}` : ''}`}
                right={<T color={t.primary} weight="600">Select</T>}
                onPress={() => onPick(g.id)}
                last={i === sorted.length - 1}
              />
            ))}
          </Card>
        </Section>
      )}

      <Section title="Or create a new group">
        <Input placeholder={friendId ? `e.g. ${nameOf(friendId)} & me` : 'e.g. Weekend trip'} value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {CURRENCIES.map((c) => <Chip key={c} label={c} active={c === currency} onPress={() => setCurrency(c)} />)}
        </View>
        {friends.length > 0 && (
          <>
            <T muted size={13}>Members (you're included automatically)</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {friends.map((f) => <Chip key={f.id} label={f.name} active={members.includes(f.id)} onPress={() => toggle(f.id)} />)}
            </View>
          </>
        )}
        <ErrorText error={error} />
        <Button title="Create group and continue" onPress={create} busy={busy} disabled={!name.trim()} />
      </Section>
    </Screen>
  );
}

function Form({ ctx, meId, friendId }: { ctx: Ctx; meId: string; friendId?: string }) {
  const api = useApi();
  const t = useTheme();
  const ex = ctx.existing;
  const editingExact = ex && ex.splitType !== 'equal';

  const [description, setDescription] = useState(ex?.description ?? '');
  const [currency, setCurrency] = useState(ctx.currency);
  const [amountText, setAmountText] = useState(ex ? toInput(ex.amount, ex.currency) : '');
  const [payer, setPayer] = useState(ex?.paidBy[0]?.userId ?? meId);
  const [participants, setParticipants] = useState<string[]>(() => {
    if (ex) return ex.shares.map((s) => s.userId);
    if (ctx.groupId) return ctx.people.map((p) => p.id);
    return friendId ? [meId, decodeURIComponent(friendId)] : [meId];
  });
  // Edits of non-equal splits come back as exact amounts (the original % / share inputs aren't stored).
  const [splitType, setSplitType] = useState<SplitType>(editingExact ? 'exact' : 'equal');
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    editingExact ? Object.fromEntries(ex.shares.map((s) => [s.userId, toInput(s.amount, ex.currency)])) : {},
  );
  const [date, setDate] = useState((ex?.date ?? new Date().toISOString()).slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const multiPayer = (ex?.paidBy.length ?? 0) > 1;
  const amount = parse(amountText || '0', currency) ?? 0;
  const ordered = ctx.people.filter((p) => participants.includes(p.id)).map((p) => p.id);
  const split = useMemo(() => computeShares(amount, currency, splitType, ordered, inputs), [amount, currency, splitType, ordered.join(), inputs]);
  const nameOf = (id: string) => (id === meId ? 'You' : ctx.people.find((p) => p.id === id)?.name ?? id);

  useEffect(() => { if (!participants.includes(payer) && participants.length && !ctx.groupId) setParticipants((p) => [...p, payer]); }, [payer]);

  const toggle = (id: string) => setParticipants((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const save = async () => {
    setError(undefined);
    if (!description.trim()) return setError('Add a description');
    if (!amount) return setError('Enter a valid amount');
    if (!split.ok) return setError(split.error);
    if (!ctx.groupId && !ordered.includes(meId) && payer !== meId) return setError('You need to be part of a non-group expense');
    setBusy(true);
    try {
      const body = {
        groupId: ctx.groupId, description: description.trim(), amount, currency,
        date: new Date(`${date}T12:00:00`).toISOString(), splitType,
        paidBy: multiPayer ? ex!.paidBy : [{ userId: payer, amount }],
        shares: split.shares.filter((s) => s.amount > 0),
      };
      if (ex) await api.updateExpense(ex.id, body); else await api.createExpense(body);
      router.back();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const hint = splitType === 'exact' ? '0.00' : splitType === 'percent' ? '%' : 'shares';

  return (
    <Screen>
      <Stack.Screen options={{ title: ex ? 'Edit expense' : ctx.groupName ? `Add to ${ctx.groupName}` : 'Add expense' }} />
      <Input label="Description" placeholder="e.g. Dinner at Ravi" value={description} onChangeText={setDescription} autoFocus={!ex} />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Input label={`Amount (${currency})`} placeholder="0.00" keyboardType="decimal-pad" value={amountText} onChangeText={setAmountText} />
        </View>
        <View style={{ width: 130 }}>
          <Input label="Date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} />
        </View>
      </View>
      {!ctx.groupId && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {CURRENCIES.map((c) => <Chip key={c} label={c} active={c === currency} onPress={() => setCurrency(c)} />)}
        </View>
      )}

      <Section title="Paid by">
        {multiPayer ? <T muted>Multiple payers (kept from the original)</T> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ctx.people.filter((p) => ctx.groupId || participants.includes(p.id)).map((p) => (
              <Chip key={p.id} label={nameOf(p.id)} active={payer === p.id} onPress={() => setPayer(p.id)} />
            ))}
          </View>
        )}
      </Section>

      <Section title="Split between">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ctx.people.map((p) => <Chip key={p.id} label={nameOf(p.id)} active={participants.includes(p.id)} onPress={() => toggle(p.id)} />)}
        </View>
        {!ctx.groupId && <T muted size={12}>Only friends appear here. Add someone new from the Friends tab first.</T>}
      </Section>

      <Section title="How to split">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(splitLabels) as SplitType[]).map((s) => <Chip key={s} label={splitLabels[s]} active={splitType === s} onPress={() => setSplitType(s)} />)}
        </View>
        <Card>
          {ordered.map((id, i) => {
            const share = split.ok ? split.shares.find((s) => s.userId === id)?.amount ?? 0 : undefined;
            return (
              <Row
                key={id}
                title={nameOf(id)}
                subtitle={share !== undefined ? format(share, currency) : undefined}
                right={splitType === 'equal' ? undefined : (
                  <View style={{ width: 110 }}>
                    <Input
                      placeholder={hint}
                      keyboardType={splitType === 'shares' ? 'number-pad' : 'decimal-pad'}
                      value={inputs[id] ?? ''}
                      onChangeText={(v) => setInputs((s) => ({ ...s, [id]: v }))}
                      style={{ paddingVertical: 8, textAlign: 'right' }}
                    />
                  </View>
                )}
                last={i === ordered.length - 1}
              />
            );
          })}
        </Card>
        {!split.ok && amount > 0 && <T size={13} color={t.owe}>{split.error}</T>}
      </Section>

      <ErrorText error={error} />
      <Button title={ex ? 'Save changes' : 'Save expense'} onPress={save} busy={busy} />
    </Screen>
  );
}

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useApi } from '../src/api';
import { useMe } from '../src/me';
import { decimals, format, parse } from '../src/money';
import { Avatar, Button, ErrorText, Input, Screen, T } from '../src/ui';

/**
 * Record a payment. Params either:
 *  - from, to, amount, currency, groupId?   (from a group's suggested settle-ups)
 *  - with, direction ('pay'|'receive'), amount, currency   (from a friend page)
 */
export default function Settle() {
  const p = useLocalSearchParams<{ from?: string; to?: string; with?: string; direction?: string; amount: string; currency: string; groupId?: string }>();
  const api = useApi();
  const { me, nameOf } = useMe();
  const meId = me!.id;
  const initial = p.with
    ? p.direction === 'pay' ? { from: meId, to: p.with } : { from: p.with, to: meId }
    : { from: p.from!, to: p.to! };
  const [pair, setPair] = useState(initial);
  const d = decimals(p.currency);
  const [amountText, setAmountText] = useState((Number(p.amount) / 10 ** d).toFixed(d));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const amount = parse(amountText, p.currency) ?? 0;

  const save = async () => {
    if (!amount) return setError('Enter a valid amount');
    setBusy(true); setError(undefined);
    try {
      await api.settle({ ...pair, amount, currency: p.currency, groupId: p.groupId || null });
      router.back();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Screen style={{ alignItems: 'stretch', gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 }}>
        <Avatar name={nameOf(pair.from)} size={60} />
        <T size={28}>→</T>
        <Avatar name={nameOf(pair.to)} size={60} />
      </View>
      <T center size={18} weight="600">{nameOf(pair.from)} {pair.from === meId ? 'pay' : 'paid'} {nameOf(pair.to)}</T>
      <Input label={`Amount (${p.currency})`} keyboardType="decimal-pad" value={amountText} onChangeText={setAmountText} style={{ fontSize: 24, textAlign: 'center' }} />
      {amount > 0 && <T muted center>Records a {format(amount, p.currency)} payment made outside the app (cash, bank transfer…)</T>}
      <ErrorText error={error} />
      <Button title="Record payment" onPress={save} busy={busy} />
      <Button title="Swap direction" kind="secondary" onPress={() => setPair({ from: pair.to, to: pair.from })} />
    </Screen>
  );
}

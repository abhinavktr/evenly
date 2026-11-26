import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useApi, useLoad } from '../../src/api';
import { ExpenseRow } from '../../src/expenseRow';
import { AddExpenseFab } from '../../src/fab';
import { useMe } from '../../src/me';
import { format } from '../../src/money';
import { Avatar, BalanceLabel, Button, Card, Empty, ErrorText, Input, Row, Screen, Section, T, useTheme } from '../../src/ui';

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTheme();
  const { me, nameOf, rememberPeople } = useMe();
  const { data, error, loading, reload } = useLoad(() => api.group(id), [id]);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string>();

  useEffect(() => { if (data) rememberPeople(data.members); }, [data, rememberPeople]);

  const addMember = async () => {
    setAdding(true); setAddError(undefined);
    try { await api.addMember(id, email.trim()); setEmail(''); await reload(); }
    catch (e: any) { setAddError(e.message); } finally { setAdding(false); }
  };

  const removeMember = (userId: string, name: string) =>
    Alert.alert(`Remove ${name}?`, 'Only possible when their balance in this group is settled.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.removeMember(id, userId);
          if (userId === me?.id) router.back(); else await reload();
        } catch (e: any) { Alert.alert('Could not remove', e.message); }
      } },
    ]);

  const mine = data?.simplifiedDebts.filter((d) => d.from === me?.id || d.to === me?.id) ?? [];
  const others = data?.simplifiedDebts.filter((d) => d.from !== me?.id && d.to !== me?.id) ?? [];

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: data?.group.name ?? '' }} />
      <Screen refreshing={loading} onRefresh={reload} style={{ paddingBottom: 96 }}>
        <ErrorText error={error} />
        {data && (
          <>
            <Section title="Settle up">
              {data.simplifiedDebts.length === 0 ? <Card style={{ padding: 16 }}><T muted center>Everyone is settled up 🎉</T></Card> : (
                <Card>
                  {[...mine, ...others].map((d, i, arr) => {
                    const involved = d.from === me?.id || d.to === me?.id;
                    return (
                      <Row
                        key={`${d.from}-${d.to}-${d.currency}`}
                        title={`${nameOf(d.from)} ${d.from === me?.id ? 'owe' : 'owes'} ${nameOf(d.to)}`}
                        subtitle={involved ? 'Tap to record a payment' : undefined}
                        right={<T weight="600" color={d.from === me?.id ? t.owe : d.to === me?.id ? t.owed : t.text}>{format(d.amount, d.currency)}</T>}
                        onPress={() => router.push({ pathname: '/settle', params: {
                          from: d.from, to: d.to, amount: String(d.amount), currency: d.currency, groupId: id,
                        } })}
                        last={i === arr.length - 1}
                      />
                    );
                  })}
                </Card>
              )}
            </Section>

            <Section title="Expenses">
              {data.expenses.length === 0 ? <Empty title="No expenses yet" body="Tap “Add expense” to get started." /> : (
                <Card>{data.expenses.map((e, i) => <ExpenseRow key={e.id} e={e} last={i === data.expenses.length - 1} />)}</Card>
              )}
            </Section>

            <Section title={`Members · ${data.members.length}`}>
              <Card>
                {data.members.map((m, i) => (
                  <Row
                    key={m.id}
                    left={<Avatar name={m.name} size={34} />}
                    title={m.id === me?.id ? `${m.name} (you)` : m.name}
                    subtitle={m.registered ? undefined : 'invited'}
                    right={<BalanceLabel balance={m.balance} prefix={['gets back', 'owes']} />}
                    onPress={() => removeMember(m.id, m.name)}
                    last={i === data.members.length - 1}
                  />
                ))}
              </Card>
              <Input placeholder="Add member by email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
              <ErrorText error={addError} />
              <Button title="Add member" kind="secondary" onPress={addMember} busy={adding} disabled={!email.includes('@')} />
            </Section>
          </>
        )}
      </Screen>
      <AddExpenseFab params={{ groupId: id }} />
    </View>
  );
}

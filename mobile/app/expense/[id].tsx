import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';
import { useApi, useLoad } from '../../src/api';
import { useMe } from '../../src/me';
import { format } from '../../src/money';
import { Avatar, Button, Card, ErrorText, Row, Screen, Section, T, splitLabels, useTheme } from '../../src/ui';

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTheme();
  const { nameOf } = useMe();
  const { data: e, error, loading, reload } = useLoad(() => api.expense(id), [id]);

  const remove = () =>
    Alert.alert(e?.kind === 'payment' ? 'Delete payment?' : 'Delete expense?', 'Balances will be recalculated for everyone involved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.deleteExpense(id); router.back(); } catch (err: any) { Alert.alert('Could not delete', err.message); }
      } },
    ]);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: e?.kind === 'payment' ? 'Payment' : 'Expense' }} />
      <ErrorText error={error} />
      {e && (
        <>
          <Card style={{ padding: 18, gap: 4 }}>
            <T size={22} weight="700">{e.kind === 'payment' ? `${nameOf(e.paidBy[0]!.userId)} paid ${nameOf(e.shares[0]!.userId)}` : e.description}</T>
            <T size={28} weight="700">{format(e.amount, e.currency)}</T>
            <T muted>{new Date(e.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}{e.kind === 'expense' ? ` · split ${splitLabels[e.splitType].toLowerCase()}` : ''}</T>
            <T muted size={13}>Added by {nameOf(e.createdBy)} · {new Date(e.createdAt).toLocaleString()}</T>
            {e.deleted && <T color={t.danger} weight="600">Deleted by {nameOf(e.deletedBy ?? '')}</T>}
          </Card>
          {e.kind === 'expense' && (
            <>
              <Section title="Paid">
                <Card>{e.paidBy.map((p, i) => <Row key={p.userId} left={<Avatar name={nameOf(p.userId)} size={32} />} title={nameOf(p.userId)} right={<T weight="600">{format(p.amount, e.currency)}</T>} last={i === e.paidBy.length - 1} />)}</Card>
              </Section>
              <Section title="Owes">
                <Card>{e.shares.map((s, i) => <Row key={s.userId} left={<Avatar name={nameOf(s.userId)} size={32} />} title={nameOf(s.userId)} right={<T weight="600">{format(s.amount, e.currency)}</T>} last={i === e.shares.length - 1} />)}</Card>
              </Section>
            </>
          )}
          {e.notes ? <Card style={{ padding: 14 }}><T>{e.notes}</T></Card> : null}
          {!e.deleted && (
            <View style={{ gap: 10, marginTop: 8 }}>
              {e.kind === 'expense' && <Button title="Edit" kind="secondary" onPress={() => router.push({ pathname: '/expense/new', params: { id: e.id } })} />}
              <Button title="Delete" kind="danger" onPress={remove} />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

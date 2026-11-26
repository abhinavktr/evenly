import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useApi, useLoad } from '../../src/api';
import { ExpenseRow } from '../../src/expenseRow';
import { AddExpenseFab } from '../../src/fab';
import { format } from '../../src/money';
import { Avatar, Button, Card, Empty, ErrorText, Screen, Section, T, useTheme } from '../../src/ui';

export default function FriendDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friendId = decodeURIComponent(id);
  const api = useApi();
  const t = useTheme();
  const { data, error, loading, reload } = useLoad(() => api.friend(friendId), [friendId]);
  const entries = data ? Object.entries(data.balance).filter(([, v]) => v !== 0) : [];

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: data?.friend.name ?? '' }} />
      <Screen refreshing={loading} onRefresh={reload} style={{ paddingBottom: 96 }}>
        <ErrorText error={error} />
        {data && (
          <>
            <Card style={{ padding: 16, alignItems: 'center', gap: 8 }}>
              <Avatar name={data.friend.name} size={64} />
              <T size={20} weight="600">{data.friend.name}</T>
              <T muted>{data.friend.email}{data.friend.registered ? '' : ' · invited'}</T>
              {entries.length === 0 && <T muted>You are all settled up</T>}
              {entries.map(([cur, v]) => (
                <T key={cur} size={17} weight="600" color={v > 0 ? t.owed : t.owe}>
                  {v > 0 ? `${data.friend.name} owes you ${format(v, cur)}` : `You owe ${data.friend.name} ${format(-v, cur)}`}
                </T>
              ))}
            </Card>
            {entries.map(([cur, v]) => (
              <Button
                key={cur}
                title={entries.length > 1 ? `Settle up ${cur}` : 'Settle up'}
                kind="secondary"
                onPress={() => router.push({ pathname: '/settle', params: { with: friendId, amount: String(Math.abs(v)), currency: cur, direction: v < 0 ? 'pay' : 'receive' } })}
              />
            ))}
            <Section title="Shared expenses">
              {data.expenses.length === 0 ? <Empty title="No expenses yet" /> : (
                <Card>{data.expenses.map((e, i) => <ExpenseRow key={e.id} e={e} last={i === data.expenses.length - 1} />)}</Card>
              )}
            </Section>
          </>
        )}
      </Screen>
      <AddExpenseFab params={{ friendId }} />
    </View>
  );
}

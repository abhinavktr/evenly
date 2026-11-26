import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useApi, useLoad } from '../../src/api';
import { AddExpenseFab } from '../../src/fab';
import { useMe } from '../../src/me';
import { lines } from '../../src/money';
import { Avatar, BalanceLabel, Card, Empty, ErrorText, Row, Screen, T, useTheme } from '../../src/ui';

export default function Friends() {
  const api = useApi();
  const t = useTheme();
  const { rememberPeople } = useMe();
  const { data, error, loading, reload } = useLoad(async () => {
    const [friends, summary] = await Promise.all([api.friends(), api.balances()]);
    return { friends, summary };
  });

  useEffect(() => { if (data) rememberPeople(data.friends); }, [data, rememberPeople]);

  const owed = data ? lines(data.summary.youAreOwed) : [];
  const owe = data ? lines(data.summary.youOwe) : [];

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
        {data && (
          <Card style={{ padding: 16, flexDirection: 'row' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T muted size={13}>You are owed</T>
              {owed.length ? owed.map((l) => <T key={l} size={18} weight="700" color={t.owed}>{l}</T>) : <T size={18} weight="700">—</T>}
            </View>
            <View style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
              <T muted size={13}>You owe</T>
              {owe.length ? owe.map((l) => <T key={l} size={18} weight="700" color={t.owe}>{l}</T>) : <T size={18} weight="700">—</T>}
            </View>
          </Card>
        )}
        {data && data.friends.length === 0 && (
          <Empty title="No friends yet" body="Add a friend by email to start splitting. They don't need an account yet." />
        )}
        {data && data.friends.length > 0 && (
          <Card>
            {data.friends.map((f, i) => (
              <Row
                key={f.id}
                left={<Avatar name={f.name} />}
                title={f.name}
                subtitle={f.registered ? f.email : `${f.email} · invited`}
                right={<BalanceLabel balance={f.balance} />}
                onPress={() => router.push(`/friend/${encodeURIComponent(f.id)}`)}
                last={i === data.friends.length - 1}
              />
            ))}
          </Card>
        )}
      </Screen>
      <AddExpenseFab />
    </View>
  );
}

import { router } from 'expo-router';
import { View } from 'react-native';
import { useApi, useLoad } from '../../src/api';
import { AddExpenseFab } from '../../src/fab';
import { Avatar, BalanceLabel, Card, Empty, ErrorText, Row, Screen } from '../../src/ui';

export default function Groups() {
  const api = useApi();
  const { data, error, loading, reload } = useLoad(api.groups);

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
        {data && data.length === 0 && <Empty title="No groups yet" body="Create a group for a trip, your flat, or a team lunch." />}
        {data && data.length > 0 && (
          <Card>
            {data.map((g, i) => (
              <Row
                key={g.id}
                left={<Avatar name={g.name} size={44} />}
                title={g.name}
                subtitle={`${g.memberIds.length} members · ${g.currency}`}
                right={<BalanceLabel balance={g.myBalance ?? {}} prefix={['you are owed', 'you owe']} />}
                onPress={() => router.push(`/group/${g.id}`)}
                last={i === data.length - 1}
              />
            ))}
          </Card>
        )}
      </Screen>
      <AddExpenseFab />
    </View>
  );
}

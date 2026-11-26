import { router } from 'expo-router';
import { useApi, useLoad } from '../../src/api';
import { useMe } from '../../src/me';
import { format } from '../../src/money';
import { Avatar, Card, Empty, ErrorText, Row, Screen, T, shortDate, useTheme } from '../../src/ui';

export default function Activity() {
  const api = useApi();
  const t = useTheme();
  const { me, nameOf } = useMe();
  const { data, error, loading, reload } = useLoad(api.activity);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />
      {data && data.length === 0 && <Empty title="Nothing here yet" body="Expenses and payments will appear here." />}
      {data && data.length > 0 && (
        <Card>
          {data.map((a, i) => {
            const actor = (a.deletedBy ?? a.createdBy) === me?.id ? 'You' : a.actorName;
            const title = a.deleted
              ? `${actor} deleted "${a.description}"`
              : a.kind === 'payment'
                ? `${nameOf(a.paidBy[0]!.userId)} paid ${nameOf(a.shares[0]!.userId)}`
                : `${actor} added "${a.description}"`;
            const effect = a.deleted || a.myEffect === 0
              ? <T muted size={13}>{a.deleted ? 'deleted' : 'not involved'}</T>
              : <T size={13} weight="600" color={a.myEffect > 0 ? t.owed : t.owe}>
                  {a.kind === 'payment' ? (a.myEffect > 0 ? 'you paid ' : 'you received ') : (a.myEffect > 0 ? 'you get back ' : 'you owe ')}
                  {format(Math.abs(a.myEffect), a.currency)}
                </T>;
            return (
              <Row
                key={a.id}
                left={<Avatar name={a.description} size={36} />}
                title={title}
                subtitle={`${format(a.amount, a.currency)} · ${shortDate(a.updatedAt)}`}
                right={effect}
                onPress={() => router.push(`/expense/${a.id}`)}
                last={i === data.length - 1}
              />
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

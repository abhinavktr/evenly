import { router } from 'expo-router';
import { View } from 'react-native';
import type { Expense } from './api';
import { useMe } from './me';
import { format } from './money';
import { Row, T, shortDate, useTheme } from './ui';

/** My net effect in one expense: + I'm owed, − I owe. */
export const myNet = (e: Expense, me: string) =>
  e.paidBy.filter((p) => p.userId === me).reduce((a, p) => a + p.amount, 0) -
  e.shares.filter((s) => s.userId === me).reduce((a, s) => a + s.amount, 0);

export function ExpenseRow({ e, last }: { e: Expense; last?: boolean }) {
  const t = useTheme();
  const { me, nameOf } = useMe();
  const net = me ? myNet(e, me.id) : 0;
  const d = new Date(e.date);
  const isPayment = e.kind === 'payment';
  const payer = e.paidBy.length === 1 ? nameOf(e.paidBy[0]!.userId) : `${e.paidBy.length} people`;
  return (
    <Row
      left={
        <View style={{ width: 36, alignItems: 'center' }}>
          <T muted size={11}>{d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</T>
          <T size={18} weight="600">{d.getDate()}</T>
        </View>
      }
      title={isPayment ? `${nameOf(e.paidBy[0]!.userId)} paid ${nameOf(e.shares[0]!.userId)}` : e.description}
      subtitle={isPayment ? shortDate(e.date) : `${payer} paid ${format(e.amount, e.currency)}`}
      right={
        net === 0 ? <T muted size={13}>{isPayment ? format(e.amount, e.currency) : 'not involved'}</T> : (
          <View style={{ alignItems: 'flex-end' }}>
            <T size={11} color={net > 0 ? t.owed : t.owe}>{isPayment ? (net > 0 ? 'you paid' : 'you received') : net > 0 ? 'you lent' : 'you borrowed'}</T>
            <T size={15} weight="600" color={net > 0 ? t.owed : t.owe}>{format(Math.abs(net), e.currency)}</T>
          </View>
        )
      }
      onPress={() => router.push(`/expense/${e.id}`)}
      last={last}
    />
  );
}

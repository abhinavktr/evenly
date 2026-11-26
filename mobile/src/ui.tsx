import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type ViewStyle, useColorScheme,
} from 'react-native';
import { lines, type SplitType } from './money';
import type { Balance } from './api';

const light = {
  bg: '#F6F7F9', card: '#FFFFFF', text: '#111827', muted: '#6B7280', border: '#E5E7EB',
  primary: '#0F766E', primaryText: '#FFFFFF', owed: '#047857', owe: '#C2410C', danger: '#B91C1C', chip: '#ECFDF5',
};
const dark: typeof light = {
  bg: '#0B0F14', card: '#151B23', text: '#F3F4F6', muted: '#9CA3AF', border: '#27303B',
  primary: '#14B8A6', primaryText: '#042F2E', owed: '#34D399', owe: '#FB923C', danger: '#F87171', chip: '#0F2A27',
};

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

export function Screen({ children, refreshing, onRefresh, style }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: 48 }, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, overflow: 'hidden' }, style]}>{children}</View>;
}

export function T({ children, muted, size = 16, weight, color, center, numberOfLines }: {
  children: ReactNode; muted?: boolean; size?: number; weight?: '400' | '500' | '600' | '700'; color?: string; center?: boolean; numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={{ color: color ?? (muted ? t.muted : t.text), fontSize: size, fontWeight: weight, textAlign: center ? 'center' : undefined }}>
      {children}
    </Text>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const t = useTheme();
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('');
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 45%, 45%)`, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials || '?'}</Text>
      <View style={{ position: 'absolute', inset: 0, borderRadius: size / 2, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }} />
    </View>
  );
}

export function Row({ left, title, subtitle, right, onPress, last }: {
  left?: ReactNode; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; last?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
        backgroundColor: pressed ? t.bg : 'transparent',
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.border,
      })}
    >
      {left}
      <View style={{ flex: 1 }}>
        <T weight="500" numberOfLines={1}>{title}</T>
        {subtitle ? <T muted size={13} numberOfLines={2}>{subtitle}</T> : null}
      </View>
      {right}
    </Pressable>
  );
}

/** "owes you AED 20" / "you owe AED 20" / "settled up" */
export function BalanceLabel({ balance, align = 'right', prefix }: { balance: Balance; align?: 'left' | 'right'; prefix?: [string, string] }) {
  const t = useTheme();
  const entries = Object.entries(balance).filter(([, v]) => v !== 0);
  if (entries.length === 0) return <T muted size={13}>settled up</T>;
  const [owedLabel, oweLabel] = prefix ?? ['owes you', 'you owe'];
  return (
    <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      {entries.map(([cur, v]) => (
        <View key={cur} style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
          <T size={11} color={v > 0 ? t.owed : t.owe}>{v > 0 ? owedLabel : oweLabel}</T>
          <T size={15} weight="600" color={v > 0 ? t.owed : t.owe}>{lines({ [cur]: v })[0]}</T>
        </View>
      ))}
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, busy }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; busy?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.primary : 'transparent';
  const fg = kind === 'primary' ? t.primaryText : kind === 'danger' ? t.danger : t.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => ({
        backgroundColor: bg, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
        borderWidth: kind === 'primary' ? 0 : 1, borderColor: kind === 'danger' ? t.danger : t.primary,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? <T muted size={13}>{label}</T> : null}
      <TextInput
        placeholderTextColor={t.muted}
        {...rest}
        style={[{ backgroundColor: t.card, color: t.text, borderRadius: 10, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 }, style]}
      />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? t.primary : t.border, backgroundColor: active ? t.chip : t.card }}>
      <Text style={{ color: active ? t.primary : t.text, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
        <T muted size={13} weight="600">{title.toUpperCase()}</T>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
      <T weight="600" size={17}>{title}</T>
      {body ? <T muted center>{body}</T> : null}
    </View>
  );
}

export function ErrorText({ error }: { error?: string }) {
  const t = useTheme();
  return error ? <T color={t.danger} size={14}>{error}</T> : null;
}

export function Loading() {
  const t = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator /></View>;
}

export const splitLabels: Record<SplitType, string> = { equal: 'Equally', exact: 'Exact amounts', percent: 'Percentages', shares: 'Shares' };

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

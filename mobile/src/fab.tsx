import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useTheme } from './ui';

/** Floating "Add expense" button. */
export function AddExpenseFab({ params }: { params?: Record<string, string> }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/expense/new', params })}
      style={({ pressed }) => ({
        position: 'absolute', right: 18, bottom: 22, backgroundColor: t.primary, borderRadius: 999,
        paddingHorizontal: 20, paddingVertical: 14, opacity: pressed ? 0.85 : 1,
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
      })}
    >
      <Text style={{ color: t.primaryText, fontWeight: '700', fontSize: 16 }}>＋ Add expense</Text>
    </Pressable>
  );
}

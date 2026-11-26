import { Tabs, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useTheme } from '../../src/ui';

const Icon = ({ glyph, color }: { glyph: string; color: any }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const t = useTheme();
  const headerButton = (label: string, href: '/friend/add' | '/group/new') => () => (
    <Pressable onPress={() => router.push(href)} hitSlop={10} style={{ paddingHorizontal: 16 }}>
      <Text style={{ color: t.primary, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary, tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.card }, headerTitleStyle: { color: t.text },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Friends', headerRight: headerButton('Add friend', '/friend/add'), tabBarIcon: ({ color }) => <Icon glyph="👤" color={color} /> }} />
      <Tabs.Screen name="groups" options={{ title: 'Groups', headerRight: headerButton('New group', '/group/new'), tabBarIcon: ({ color }) => <Icon glyph="👥" color={color} /> }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: ({ color }) => <Icon glyph="🕘" color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color }) => <Icon glyph="⚙︎" color={color} /> }} />
    </Tabs>
  );
}

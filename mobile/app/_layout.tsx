import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth';
import { config } from '../src/config';
import { MeProvider, useMe } from '../src/me';
import { Button, ErrorText, Input, Loading, T, useTheme } from '../src/ui';

export default function Root() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { ready, signedIn } = useAuth();
  if (!ready) return <Loading />;
  if (!signedIn) return <SignIn />;
  return (
    <MeProvider>
      <AppStack />
    </MeProvider>
  );
}

function AppStack() {
  const t = useTheme();
  const { me, error, refreshMe } = useMe();
  const { signOut } = useAuth();
  if (!me) {
    return error ? (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: t.bg }}>
        <ErrorText error={error} />
        <Button title="Try again" onPress={refreshMe} />
        <Button title="Sign out" kind="secondary" onPress={signOut} />
      </View>
    ) : <Loading />;
  }
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.card }, headerTintColor: t.primary,
          headerTitleStyle: { color: t.text }, contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="friend/add" options={{ title: 'Add friend', presentation: 'modal' }} />
        <Stack.Screen name="friend/[id]" options={{ title: '' }} />
        <Stack.Screen name="group/new" options={{ title: 'New group', presentation: 'modal' }} />
        <Stack.Screen name="group/[id]" options={{ title: '' }} />
        <Stack.Screen name="expense/new" options={{ title: 'Add expense', presentation: 'modal' }} />
        <Stack.Screen name="expense/[id]" options={{ title: 'Expense' }} />
        <Stack.Screen name="settle" options={{ title: 'Settle up', presentation: 'modal' }} />
      </Stack>
    </>
  );
}

function SignIn() {
  const t = useTheme();
  const { signIn, signInDev, error } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 16, backgroundColor: t.bg }}>
      <StatusBar style="auto" />
      <View style={{ alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Image source={require('../assets/logo.png')} style={{ width: 96, height: 96 }} accessibilityIgnoresInvertColors />
        <T size={32} weight="700">SplitFree</T>
        <T size={17} weight="600" color={t.primary}>Split evenly. Always free.</T>
        <T muted center>Share bills with friends, flatmates and trips.{'\n'}No ads, no premium tier, no limits.</T>
      </View>
      <View style={{ gap: 6, marginBottom: 8 }}>
        {['Equal, exact, % or share-based splits', 'Groups, balances and simplified debts', 'Unlimited expenses — free forever'].map((line) => (
          <T key={line} muted size={14}>✓  {line}</T>
        ))}
      </View>
      {config.authMode === 'dev' ? (
        <>
          <Input label="Dev sign-in (local API only)" placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Button title="Continue" busy={busy} disabled={!email.includes('@')} onPress={() => run(() => signInDev(email))} />
        </>
      ) : (
        <Button title="Sign in or create account" busy={busy} onPress={() => run(signIn)} />
      )}
      <ErrorText error={error} />
    </View>
  );
}

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';
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
        <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
          <T size={36} weight="700" color={t.primaryText}>=</T>
        </View>
        <T size={30} weight="700">Evenly</T>
        <T muted center>Split bills with friends and groups.{'\n'}Keep track of who owes who.</T>
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

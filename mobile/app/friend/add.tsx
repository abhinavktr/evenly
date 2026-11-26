import { router } from 'expo-router';
import { useState } from 'react';
import { useApi } from '../../src/api';
import { useMe } from '../../src/me';
import { Button, ErrorText, Input, Screen, T } from '../../src/ui';

export default function AddFriend() {
  const api = useApi();
  const { rememberPeople } = useMe();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const add = async () => {
    setBusy(true); setError(undefined);
    try {
      const f = await api.addFriend(email.trim(), name.trim() || undefined);
      rememberPeople([f]);
      router.back();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <Input label="Email" placeholder="friend@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} autoFocus />
      <Input label="Name (optional)" placeholder="How you'll see them" value={name} onChangeText={setName} />
      <T muted size={13}>If they don't have an account yet, they'll see everything you've shared as soon as they sign in with this email.</T>
      <ErrorText error={error} />
      <Button title="Add friend" onPress={add} busy={busy} disabled={!email.includes('@')} />
    </Screen>
  );
}

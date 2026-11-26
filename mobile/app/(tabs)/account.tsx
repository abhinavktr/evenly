import { useState } from 'react';
import { View } from 'react-native';
import { useApi } from '../../src/api';
import { useAuth } from '../../src/auth';
import { useMe } from '../../src/me';
import { CURRENCIES } from '../../src/money';
import { Avatar, Button, Card, Chip, ErrorText, Input, Screen, Section, T } from '../../src/ui';

export default function Account() {
  const api = useApi();
  const { me, refreshMe } = useMe();
  const { signOut } = useAuth();
  const [name, setName] = useState(me?.name ?? '');
  const [currency, setCurrency] = useState(me?.defaultCurrency ?? 'AED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true); setError(undefined); setSaved(false);
    try {
      await api.updateMe({ name, defaultCurrency: currency });
      await refreshMe();
      setSaved(true);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={me?.name ?? '?'} size={56} />
        <View style={{ flex: 1 }}>
          <T size={18} weight="600">{me?.name}</T>
          <T muted>{me?.email}</T>
        </View>
      </Card>
      <Section title="Profile">
        <Input label="Display name" value={name} onChangeText={setName} />
        <T muted size={13}>Default currency</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CURRENCIES.map((c) => <Chip key={c} label={c} active={c === currency} onPress={() => setCurrency(c)} />)}
        </View>
        <ErrorText error={error} />
        {saved && <T muted size={13}>Saved.</T>}
        <Button title="Save" onPress={save} busy={busy} disabled={!name.trim()} />
      </Section>
      <View style={{ height: 12 }} />
      <Button title="Sign out" kind="danger" onPress={signOut} />
    </Screen>
  );
}

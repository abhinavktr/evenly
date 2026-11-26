import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useApi, useLoad } from '../../src/api';
import { useMe } from '../../src/me';
import { CURRENCIES } from '../../src/money';
import { Button, Chip, ErrorText, Input, Screen, Section, T } from '../../src/ui';

export default function NewGroup() {
  const api = useApi();
  const { me } = useMe();
  const friends = useLoad(api.friends);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(me?.defaultCurrency ?? 'AED');
  const [selected, setSelected] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async () => {
    setBusy(true); setError(undefined);
    try {
      const emails = extra.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      const members = [...selected, ...emails].map((email) => ({ email }));
      const g = await api.createGroup({ name: name.trim(), currency, members });
      router.replace(`/group/${g.id}`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <Input label="Group name" placeholder="e.g. Oman road trip" value={name} onChangeText={setName} autoFocus />
      <Section title="Currency">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CURRENCIES.map((c) => <Chip key={c} label={c} active={c === currency} onPress={() => setCurrency(c)} />)}
        </View>
      </Section>
      <Section title="Members">
        {friends.data && friends.data.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {friends.data.map((f) => <Chip key={f.id} label={f.name} active={selected.includes(f.id)} onPress={() => toggle(f.id)} />)}
          </View>
        ) : <T muted size={13}>No friends yet — add people by email below.</T>}
        <Input placeholder="Other emails, separated by commas" autoCapitalize="none" keyboardType="email-address" value={extra} onChangeText={setExtra} />
      </Section>
      <ErrorText error={error} />
      <Button title="Create group" onPress={create} busy={busy} disabled={!name.trim()} />
    </Screen>
  );
}

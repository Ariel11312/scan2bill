import React, { useCallback, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { getProfile, saveRate } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Button, ErrorBanner } from '../components/ui';

export default function SettingsScreen() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const [rate, setRate] = useState('');
  const [currency, setCurrency] = useState('PHP');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    getProfile(session.user.id).then((p) => {
      setRate(p.rate_per_kwh > 0 ? String(p.rate_per_kwh) : '');
      setCurrency(p.currency);
    });
  }, [session]));

  async function save() {
    const n = parseFloat(rate);
    if (!(n > 0)) { setError('Enter a rate greater than 0.'); setMsg(null); return; }
    setSaving(true); setError(null);
    try {
      await saveRate(session!.user.id, n, currency.trim().toUpperCase() || 'PHP');
      setMsg('Rate saved. New scans will use it.');
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the rate.');
    } finally { setSaving(false); }
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <ScrollView contentContainerClassName="p-5" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-ink mb-5">Settings</Text>

        <Text className="text-xs text-muted mb-1">Electricity rate per kWh</Text>
        <TextInput
          className="h-14 bg-panel border border-line rounded-xl px-4 text-ink text-lg mb-3"
          keyboardType="decimal-pad" placeholder="e.g. 12.50" value={rate} onChangeText={setRate}
        />
        <Text className="text-xs text-muted mb-1">Currency code</Text>
        <TextInput
          className="h-14 bg-panel border border-line rounded-xl px-4 text-ink text-lg mb-4"
          autoCapitalize="characters" maxLength={3} value={currency} onChangeText={setCurrency}
        />
        <ErrorBanner message={error} />
        {msg ? <Text className="text-volt mb-3">{msg}</Text> : null}
        <Button label="Save rate" onPress={save} loading={saving} />
        <Text className="text-xs text-muted mt-3">Past readings keep the rate they were saved with.</Text>

        <View className="h-px bg-line my-8" />

        <Button label="Enter a reading manually" variant="ghost" onPress={() => nav.navigate('Confirm', {})} />
        <Text className="text-muted text-sm mt-6 mb-3">Signed in as {session?.user.email}</Text>
        <Button label="Sign out" variant="danger" onPress={() => supabase.auth.signOut()} />
      </ScrollView>
    </SafeAreaView>
  );
}

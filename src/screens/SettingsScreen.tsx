import React, { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getProfile, saveRate } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Button, ErrorBanner } from '../components/ui';
import { Screen } from '../components/Background';
import { Field } from '../components/Field';
import { Card, Divider, ScreenHeader, Txt } from '../components/Dark';

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
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader icon="settings-outline" title="Settings" subtitle="Rate and account" />

        <Card>
          <Field
            label="Electricity rate per kWh"
            icon="flash-outline"
            placeholder="e.g. 12.50"
            keyboardType="decimal-pad"
            value={rate}
            onChangeText={setRate}
          />
          <Field
            label="Currency code"
            icon="cash-outline"
            placeholder="PHP"
            autoCapitalize="characters"
            maxLength={3}
            value={currency}
            onChangeText={setCurrency}
          />
          <ErrorBanner message={error} />
          {msg ? <Txt tone="volt" className="mb-3">{msg}</Txt> : null}
          <Button label="Save rate" onPress={save} loading={saving} />
          <Txt tone="muted" className="text-xs mt-3">Past readings keep the rate they were saved with.</Txt>
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Button label="Enter a reading manually" variant="ghost" onPress={() => nav.navigate('Confirm', {})} />
          <Divider />
          <Txt tone="muted" className="text-sm mb-3">Signed in as {session?.user.email}</Txt>
          <Button label="Sign out" variant="danger" onPress={() => supabase.auth.signOut()} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
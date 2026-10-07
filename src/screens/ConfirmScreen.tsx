import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { getLastReading, getProfile, insertReading, Profile } from '../lib/api';
import { money, validateAndCompute } from '../lib/calc';
import { Button, ErrorBanner, Stat } from '../components/ui';

type Params = { value?: number; raw?: string };

export default function ConfirmScreen() {
  const nav = useNavigation<any>();
  const params = (useRoute().params ?? {}) as Params;
  const { session } = useAuth();
  const userId = session?.user?.id;

  const scanned = params.value ?? null; // null => manual entry
  const [text, setText] = useState(scanned != null ? String(scanned) : '');
  const [previous, setPrevious] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setReady(false);
    setLoadError(null);
    (async () => {
      try {
        const [p, last] = await Promise.all([getProfile(userId), getLastReading()]);
        if (cancelled) return;
        setProfile(p);
        setPrevious(last);
        setReady(true);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? 'Could not load your profile and last reading.');
      }
    })();
    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  // Accept "12,5" as 12.5 and ignore non-numeric characters
  const onChange = useCallback((v: string) => {
    setText(v.replace(',', '.').replace(/[^0-9.]/g, ''));
  }, []);

  const current = parseFloat(text);
  const validNumber = text !== '' && !isNaN(current);

  const result = useMemo(
    () => (ready && validNumber ? validateAndCompute(current, previous, profile?.rate_per_kwh ?? 0) : null),
    [ready, validNumber, current, previous, profile]
  );
  const cur = profile?.currency ?? 'PHP';

  async function save() {
    if (saving) return;
    if (!userId) return setSaveError('You are signed out. Please sign in again.');
    if (!profile) return setSaveError('Your profile is missing, so the rate is unknown. Set it in Settings, then try again.');
    if (!result || !result.ok) return;

    setSaving(true);
    setSaveError(null);
    try {
      await insertReading({
        user_id: userId,
        reading: current,
        previous_reading: previous,
        consumption_kwh: result.consumption,
        rate_per_kwh: profile.rate_per_kwh,
        estimated_bill: result.bill,
        ocr_raw: params.raw ?? null,
        was_manually_edited: scanned == null || current !== scanned,
      });
      nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not save the reading. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="p-5" keyboardShouldPersistTaps="handled">
          <Text className="text-2xl font-bold text-ink">{scanned != null ? 'Confirm reading' : 'Enter reading'}</Text>
          <Text className="text-muted mt-1 mb-5">
            {scanned != null ? 'Compare this to your meter and correct any digit that is wrong.' : 'Type the number shown on your meter.'}
          </Text>

          {loadError ? (
            <View className="mb-5">
              <ErrorBanner message={loadError} />
              <View className="mt-2"><Button label="Retry" variant="ghost" onPress={() => setReloadKey((k) => k + 1)} /></View>
            </View>
          ) : null}

          <Text className="text-xs text-muted mb-1">Meter reading (kWh)</Text>
          <TextInput
            className="h-16 bg-panel border border-line rounded-xl px-4 text-3xl font-bold text-ink"
            keyboardType="decimal-pad" value={text} onChangeText={onChange} autoFocus={scanned == null}
          />

          <View className="mt-5">
            {result && !result.ok ? <ErrorBanner message={result.error} /> : null}
            {result?.ok && result.rolledOver ? (
              <Text className="text-muted text-sm mb-3">The meter appears to have rolled over past its maximum. Consumption accounts for that.</Text>
            ) : null}
            {previous === null && ready ? (
              <Text className="text-muted text-sm mb-3">This is your first reading. It becomes the baseline, so consumption is 0 kWh.</Text>
            ) : null}
          </View>

          <View className="bg-panel border border-line rounded-2xl p-5">
            <View className="flex-row">
              <Stat label="Previous" value={previous != null ? previous.toFixed(1) : '—'} />
              <Stat label="Current" value={validNumber ? current.toFixed(1) : '—'} />
            </View>
            <View className="h-px bg-line my-4" />
            <View className="flex-row">
              <Stat label="Consumption" value={result?.ok ? `${result.consumption} kWh` : '—'} />
              <Stat label="Rate" value={profile ? `${money(profile.rate_per_kwh, cur)}/kWh` : '—'} />
            </View>
            <View className="h-px bg-line my-4" />
            <Text className="text-xs text-muted">Estimated bill</Text>
            <Text className="text-4xl font-bold text-ink mt-1">{result?.ok ? money(result.bill, cur) : '—'}</Text>
          </View>

          <View className="mt-5"><ErrorBanner message={saveError} /></View>
          <View className="mt-1">
            <Button label="Save reading" onPress={save} loading={saving} disabled={!result?.ok || saving} />
          </View>
          <View className="mt-3">
            <Button label={scanned != null ? 'Retake scan' : 'Cancel'} variant="ghost" onPress={() => (scanned != null ? nav.replace('Scan') : nav.goBack())} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
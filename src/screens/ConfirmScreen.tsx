import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getLastReading, getProfile, insertReading, Profile } from '../lib/api';
import { money, validateAndCompute } from '../lib/calc';
import { Button, ErrorBanner } from '../components/ui';
import { Screen } from '../components/Background';
import { Field } from '../components/Field';
import { Card, Divider, ScreenHeader, StatBlock, Txt } from '../components/Dark';
import { C } from '../lib/theme';

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
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            icon="checkmark-done-outline"
            title={scanned != null ? 'Confirm reading' : 'Enter reading'}
            subtitle={
              scanned != null
                ? 'Compare this to your meter and fix any wrong digit.'
                : 'Type the number shown on your meter.'
            }
          />

          {loadError ? (
            <View style={{ marginBottom: 20 }}>
              <ErrorBanner message={loadError} />
              <View style={{ marginTop: 8 }}>
                <Button label="Retry" variant="ghost" onPress={() => setReloadKey((k) => k + 1)} />
              </View>
            </View>
          ) : null}

          <Field
            big
            label="Meter reading (kWh)"
            icon="speedometer-outline"
            placeholder="0000.0"
            keyboardType="decimal-pad"
            value={text}
            onChangeText={onChange}
            autoFocus={scanned == null}
          />

          <View style={{ marginBottom: 4 }}>
            {result && !result.ok ? <ErrorBanner message={result.error} /> : null}
            {result?.ok && result.rolledOver ? (
              <Txt tone="muted" className="text-sm mb-3">
                The meter appears to have rolled over past its maximum. Consumption accounts for that.
              </Txt>
            ) : null}
            {previous === null && ready ? (
              <Txt tone="muted" className="text-sm mb-3">
                This is your first reading. It becomes the baseline, so consumption is 0 kWh.
              </Txt>
            ) : null}
          </View>

          <Card>
            <View className="flex-row">
              <StatBlock label="Previous" value={previous != null ? previous.toFixed(1) : '—'} />
              <StatBlock label="Current" value={validNumber ? current.toFixed(1) : '—'} />
            </View>
            <Divider />
            <View className="flex-row">
              <StatBlock label="Consumption" value={result?.ok ? `${result.consumption} kWh` : '—'} />
              <StatBlock label="Rate" value={profile ? `${money(profile.rate_per_kwh, cur)}/kWh` : '—'} />
            </View>
            <Divider />
            <Txt tone="muted" className="text-xs uppercase tracking-widest">Estimated bill</Txt>
            <Txt className="text-4xl font-extrabold mt-1" style={result?.ok ? { color: C.volt } : undefined}>
              {result?.ok ? money(result.bill, cur) : '—'}
            </Txt>
          </Card>

          <View style={{ marginTop: 20 }}><ErrorBanner message={saveError} /></View>
          <View style={{ marginTop: 4 }}>
            <Button label="Save reading" onPress={save} loading={saving} disabled={!result?.ok || saving} />
          </View>
          <View style={{ marginTop: 12 }}>
            <Button
              label={scanned != null ? 'Retake scan' : 'Cancel'}
              variant="ghost"
              onPress={() => (scanned != null ? nav.replace('Scan') : nav.goBack())}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getProfile, listReadings, Profile, Reading } from '../lib/api';
import { fmtDate, money } from '../lib/calc';
import { Button, DigitWheels } from '../components/ui';
import { Screen } from '../components/Background';
import { Card, Divider, ScreenHeader, StatBlock, Txt } from '../components/Dark';
import { C } from '../lib/theme';

const SYMBOLS: Record<string, string> = { PHP: '₱', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

// Rates are shown to 4 decimals (e.g. ₱12.4567) so the figure matches the
// Meralco bill. money() is still used for bill totals (2 decimals).
function fmtRate(rate: number | null | undefined, cur: string): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return '—';
  const sym = SYMBOLS[cur] ?? `${cur} `;
  return `${sym}${rate.toFixed(4)}`;
}

function fmtKwh(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      const [p, r] = await Promise.all([getProfile(session.user.id), listReadings(14)]);
      setProfile(p);
      setReadings(r);
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const latest = readings[0];
  const previous = readings[1];
  const cur = profile?.currency ?? 'PHP';
  const recent = readings.filter((r) => r.consumption_kwh != null).slice(0, 7).reverse();
  const maxKwh = Math.max(1, ...recent.map((r) => r.consumption_kwh ?? 0));
  const needsRate = profile != null && !(profile.rate_per_kwh > 0);

  const kwh = latest?.consumption_kwh ?? null;
  const rate = latest?.rate_per_kwh ?? null;
  const hasBreakdown = kwh != null && rate != null && rate > 0;

  // If the rate in Settings changed after the last scan, say so clearly.
  const settingsRate = profile?.rate_per_kwh ?? 0;
  const rateChanged =
    latest != null && rate != null && settingsRate > 0 && Math.abs(settingsRate - rate) > 0.00005;

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.volt} colors={[C.volt]} progressBackgroundColor={C.panel} />
        }
      >
        <ScreenHeader icon="flash-outline" title="Latest reading" subtitle="Your meter at a glance" />

        {/* Meter wheels */}
        <View
          className="bg-ink"
          style={{ borderRadius: 24, padding: 20, borderWidth: 1, borderColor: C.line }}
        >
          <DigitWheels value={latest?.reading ?? null} />
          <Txt className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {latest ? `Scanned ${fmtDate(latest.scanned_at)}` : 'No reading yet. Scan your meter to set a baseline.'}
          </Txt>
        </View>

        {needsRate ? (
          <Card style={{ marginTop: 16, borderColor: C.warn, padding: 16, borderRadius: 18 }}>
            <Txt className="font-semibold">Set your electricity rate</Txt>
            <Txt tone="muted" className="text-sm mt-1">
              Your bill estimate needs a rate per kWh. Find it on your Meralco bill (total amount ÷ kWh) and add it in Settings.
            </Txt>
          </Card>
        ) : null}

        {/* Rate used */}
        <Card style={{ marginTop: 16 }}>
          <Txt tone="muted" className="text-xs uppercase tracking-widest">Rate used</Txt>
          <View className="flex-row items-end mt-1">
            <Txt className="text-4xl font-extrabold">{fmtRate(rate, cur)}</Txt>
            <Txt tone="muted" className="text-base ml-2 mb-1">per kWh</Txt>
          </View>
          {rateChanged ? (
            <Txt tone="muted" className="text-xs mt-2">
              Settings now says {fmtRate(settingsRate, cur)}/kWh. That applies to your next scan.
            </Txt>
          ) : null}
        </Card>

        {/* Consumption + bill */}
        <Card style={{ marginTop: 16 }}>
          <View className="flex-row">
            <StatBlock label="Previous reading" value={previous ? fmtKwh(previous.reading) : '—'} />
            <StatBlock label="Current reading" value={latest ? fmtKwh(latest.reading) : '—'} />
          </View>

          <Divider />

          <View className="flex-row justify-between items-baseline">
            <Txt tone="muted">Consumption</Txt>
            <Txt className="text-lg font-semibold">{kwh != null ? `${fmtKwh(kwh)} kWh` : '—'}</Txt>
          </View>
          <View className="flex-row justify-between items-baseline mt-2">
            <Txt tone="muted">Rate</Txt>
            <Txt className="text-lg font-semibold">{rate != null ? `${fmtRate(rate, cur)} /kWh` : '—'}</Txt>
          </View>

          <Divider />

          <Txt tone="muted" className="text-xs uppercase tracking-widest">Estimated bill</Txt>
          <Txt className="text-4xl font-extrabold mt-1" style={{ color: C.volt }}>
            {money(latest?.estimated_bill, cur)}
          </Txt>
          <Txt tone="muted" className="text-xs mt-2">
            {hasBreakdown
              ? `${fmtKwh(kwh)} kWh × ${fmtRate(rate, cur)} = ${money(latest?.estimated_bill, cur)}`
              : 'Scan twice with a rate set to see a bill estimate.'}
          </Txt>
          <Txt tone="muted" className="mt-1" style={{ fontSize: 11 }}>
            Estimate only. Your actual Meralco bill may differ because of taxes, fees and billing dates.
          </Txt>
        </Card>

        {/* Chart */}
        {recent.length > 0 ? (
          <Card style={{ marginTop: 16 }}>
            <Txt className="font-semibold mb-4">Consumption per scan (kWh)</Txt>
            <View className="flex-row items-end h-32">
              {recent.map((r) => (
                <View key={r.id} className="flex-1 items-center justify-end h-full">
                  <Txt tone="muted" className="mb-1" style={{ fontSize: 10 }}>{fmtKwh(r.consumption_kwh)}</Txt>
                  <View
                    style={{
                      width: 20,
                      backgroundColor: C.volt,
                      borderTopLeftRadius: 6,
                      borderTopRightRadius: 6,
                      height: `${Math.max(4, ((r.consumption_kwh ?? 0) / maxKwh) * 80)}%`,
                    }}
                  />
                  <Txt tone="muted" className="mt-1" style={{ fontSize: 10 }}>
                    {new Date(r.scanned_at).getDate()}
                  </Txt>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <View style={{ marginTop: 24 }}>
          <Button label="Scan meter" onPress={() => nav.navigate('Scan')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
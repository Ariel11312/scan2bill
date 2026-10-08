import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { getProfile, listReadings, Profile, Reading } from '../lib/api';
import { fmtDate, money } from '../lib/calc';
import { Button, DigitWheels, Stat } from '../components/ui';

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
    latest != null &&
    rate != null &&
    settingsRate > 0 &&
    Math.abs(settingsRate - rate) > 0.00005;

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <ScrollView
        contentContainerClassName="p-5 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      >
        <Text className="text-2xl font-bold text-ink mb-5">Latest reading</Text>

        <View className="bg-ink rounded-2xl p-5">
          <DigitWheels value={latest?.reading ?? null} />
          <Text className="text-white/60 text-xs mt-3">
            {latest
              ? `Scanned ${fmtDate(latest.scanned_at)}`
              : 'No reading yet. Scan your meter to set a baseline.'}
          </Text>
        </View>

        {needsRate ? (
          <View className="bg-panel border border-decimal rounded-xl p-4 mt-4">
            <Text className="text-ink font-semibold">Set your electricity rate</Text>
            <Text className="text-muted text-sm mt-1">
              Your bill estimate needs a rate per kWh. Find it on your Meralco bill (total
              amount ÷ kWh) and add it in Settings.
            </Text>
          </View>
        ) : null}

        {/* --- Rate: the figure used for the estimate --- */}
        <View className="bg-panel border border-line rounded-2xl p-5 mt-4">
          <Text className="text-xs text-muted uppercase tracking-widest">Rate used</Text>
          <View className="flex-row items-end mt-1">
            <Text className="text-4xl font-bold text-ink">{fmtRate(rate, cur)}</Text>
            <Text className="text-base text-muted ml-2 mb-1">per kWh</Text>
          </View>
          {rateChanged ? (
            <Text className="text-xs text-muted mt-2">
              Settings now says {fmtRate(settingsRate, cur)}/kWh. That applies to your next scan.
            </Text>
          ) : null}
        </View>

        {/* --- Consumption and how it was worked out --- */}
        <View className="bg-panel border border-line rounded-2xl p-5 mt-4">
          <View className="flex-row">
            <Stat label="Previous reading" value={previous ? fmtKwh(previous.reading) : '—'} />
            <Stat label="Current reading" value={latest ? fmtKwh(latest.reading) : '—'} />
          </View>

          <View className="h-px bg-line my-4" />

          <View className="flex-row justify-between items-baseline">
            <Text className="text-muted">Consumption</Text>
            <Text className="text-ink text-lg font-semibold">
              {kwh != null ? `${fmtKwh(kwh)} kWh` : '—'}
            </Text>
          </View>

          <View className="flex-row justify-between items-baseline mt-2">
            <Text className="text-muted">Rate</Text>
            <Text className="text-ink text-lg font-semibold">
              {rate != null ? `${fmtRate(rate, cur)} /kWh` : '—'}
            </Text>
          </View>

          <View className="h-px bg-line my-4" />

          <Text className="text-xs text-muted uppercase tracking-widest">Estimated bill</Text>
          <Text className="text-4xl font-bold text-ink mt-1">
            {money(latest?.estimated_bill, cur)}
          </Text>
          <Text className="text-xs text-muted mt-2">
            {hasBreakdown
              ? `${fmtKwh(kwh)} kWh × ${fmtRate(rate, cur)} = ${money(latest?.estimated_bill, cur)}`
              : 'Scan twice with a rate set to see a bill estimate.'}
          </Text>
          <Text className="text-[11px] text-muted mt-1">
            Estimate only. Your actual Meralco bill may differ because of taxes, fees and
            billing dates.
          </Text>
        </View>

        {recent.length > 0 ? (
          <View className="bg-panel border border-line rounded-2xl p-5 mt-4">
            <Text className="text-ink font-semibold mb-4">Consumption per scan (kWh)</Text>
            <View className="flex-row items-end h-32">
              {recent.map((r) => (
                <View key={r.id} className="flex-1 items-center justify-end h-full">
                  <Text className="text-[10px] text-muted mb-1">{fmtKwh(r.consumption_kwh)}</Text>
                  <View
                    className="w-5 bg-volt rounded-t"
                    style={{
                      height: `${Math.max(4, ((r.consumption_kwh ?? 0) / maxKwh) * 80)}%`,
                    }}
                  />
                  <Text className="text-[10px] text-muted mt-1">
                    {new Date(r.scanned_at).getDate()}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="mt-6">
          <Button label="Scan meter" onPress={() => nav.navigate('Scan')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
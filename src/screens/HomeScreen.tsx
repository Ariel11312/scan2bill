import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { getProfile, listReadings, Profile, Reading } from '../lib/api';
import { fmtDate, money } from '../lib/calc';
import { Button, DigitWheels, Stat } from '../components/ui';

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
      setProfile(p); setReadings(r);
    } finally { setRefreshing(false); }
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const latest = readings[0];
  const cur = profile?.currency ?? 'PHP';
  const recent = readings.filter((r) => r.consumption_kwh != null).slice(0, 7).reverse();
  const maxKwh = Math.max(1, ...recent.map((r) => r.consumption_kwh ?? 0));
  const needsRate = profile != null && !(profile.rate_per_kwh > 0);

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
            {latest ? `Scanned ${fmtDate(latest.scanned_at)}` : 'No reading yet. Scan your meter to set a baseline.'}
          </Text>
        </View>

        {needsRate ? (
          <View className="bg-panel border border-decimal rounded-xl p-4 mt-4">
            <Text className="text-ink font-semibold">Set your electricity rate</Text>
            <Text className="text-muted text-sm mt-1">Your bill estimate needs a rate per kWh. Add it in Settings.</Text>
          </View>
        ) : null}

        <View className="bg-panel border border-line rounded-2xl p-5 mt-4">
          <View className="flex-row">
            <Stat label="Consumption" value={latest?.consumption_kwh != null ? `${latest.consumption_kwh} kWh` : '—'} />
            <Stat label="Rate" value={latest ? `${money(latest.rate_per_kwh, cur)}/kWh` : '—'} />
          </View>
          <View className="h-px bg-line my-4" />
          <Text className="text-xs text-muted">Estimated bill</Text>
          <Text className="text-4xl font-bold text-ink mt-1">{money(latest?.estimated_bill, cur)}</Text>
        </View>

        {recent.length > 0 ? (
          <View className="bg-panel border border-line rounded-2xl p-5 mt-4">
            <Text className="text-ink font-semibold mb-4">Consumption per scan</Text>
            <View className="flex-row items-end h-32">
              {recent.map((r) => (
                <View key={r.id} className="flex-1 items-center justify-end h-full">
                  <Text className="text-[10px] text-muted mb-1">{r.consumption_kwh}</Text>
                  <View className="w-5 bg-volt rounded-t" style={{ height: `${Math.max(4, ((r.consumption_kwh ?? 0) / maxKwh) * 80)}%` }} />
                  <Text className="text-[10px] text-muted mt-1">{new Date(r.scanned_at).getDate()}</Text>
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

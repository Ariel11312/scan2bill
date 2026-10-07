import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { deleteReading, getProfile, listReadings, Reading } from '../lib/api';
import { fmtDate, money } from '../lib/calc';

export default function HistoryScreen() {
  const { session } = useAuth();
  const [items, setItems] = useState<Reading[]>([]);
  const [cur, setCur] = useState('PHP');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      const [r, p] = await Promise.all([listReadings(200), getProfile(session.user.id)]);
      setItems(r); setCur(p.currency);
    } finally { setRefreshing(false); }
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmDelete(id: string) {
    Alert.alert('Delete this reading?', 'The next scan will compare against the reading before it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteReading(id); load(); } },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerClassName="p-5 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListHeaderComponent={<Text className="text-2xl font-bold text-ink mb-4">History</Text>}
        ListEmptyComponent={<Text className="text-muted">No readings yet. Scan your meter from the Home tab.</Text>}
        renderItem={({ item }) => (
          <Pressable onLongPress={() => confirmDelete(item.id)} className="bg-panel border border-line rounded-2xl p-4 mb-3">
            <View className="flex-row justify-between items-start">
              <Text className="text-xs text-muted">{fmtDate(item.scanned_at)}</Text>
              {item.was_manually_edited ? <Text className="text-xs text-muted">edited</Text> : null}
            </View>
            <View className="flex-row justify-between items-end mt-2">
              <View>
                <Text className="text-2xl font-bold text-ink">{item.reading.toFixed(1)}</Text>
                <Text className="text-xs text-muted mt-0.5">
                  {item.previous_reading != null ? `from ${item.previous_reading.toFixed(1)}` : 'baseline'}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-lg font-bold text-ink">{money(item.estimated_bill, cur)}</Text>
                <Text className="text-xs text-muted mt-0.5">
                  {item.consumption_kwh ?? 0} kWh at {money(item.rate_per_kwh, cur)}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      />
      {items.length > 0 ? <Text className="text-center text-xs text-muted pb-3">Press and hold a reading to delete it</Text> : null}
    </SafeAreaView>
  );
}

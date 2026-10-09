import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { deleteReading, getProfile, listReadings, Reading } from '../lib/api';
import { fmtDate, money } from '../lib/calc';
import { Screen } from '../components/Background';
import { Card, ScreenHeader, Txt } from '../components/Dark';
import { C } from '../lib/theme';

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
    <Screen edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.volt} colors={[C.volt]} progressBackgroundColor={C.panel} />
        }
        ListHeaderComponent={
          <ScreenHeader icon="time-outline" title="History" subtitle="All your saved readings" />
        }
        ListEmptyComponent={
          <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Ionicons name="document-text-outline" size={32} color={C.muted} />
            <Txt tone="muted" className="mt-3 text-center">
              No readings yet. Scan your meter from the Home tab.
            </Txt>
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable onLongPress={() => confirmDelete(item.id)} style={{ marginBottom: 12 }}>
            <Card style={{ padding: 16, borderRadius: 20 }}>
              <View className="flex-row justify-between items-start">
                <Txt tone="muted" className="text-xs">{fmtDate(item.scanned_at)}</Txt>
                {item.was_manually_edited ? (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: C.line,
                    }}
                  >
                    <Txt tone="muted" style={{ fontSize: 10 }}>edited</Txt>
                  </View>
                ) : null}
              </View>
              <View className="flex-row justify-between items-end mt-2">
                <View>
                  <Txt className="text-2xl font-extrabold">{item.reading.toFixed(1)}</Txt>
                  <Txt tone="muted" className="text-xs mt-0.5">
                    {item.previous_reading != null ? `from ${item.previous_reading.toFixed(1)}` : 'baseline'}
                  </Txt>
                </View>
                <View className="items-end">
                  <Txt tone="volt" className="text-lg font-bold">{money(item.estimated_bill, cur)}</Txt>
                  <Txt tone="muted" className="text-xs mt-0.5">
                    {item.consumption_kwh ?? 0} kWh at {money(item.rate_per_kwh, cur)}
                  </Txt>
                </View>
              </View>
            </Card>
          </Pressable>
        )}
      />
      {items.length > 0 ? (
        <Txt tone="muted" className="text-center text-xs pb-3">Press and hold a reading to delete it</Txt>
      ) : null}
    </Screen>
  );
}
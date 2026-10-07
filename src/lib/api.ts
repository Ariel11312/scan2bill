import { supabase } from './supabase';

export type Profile = { id: string; rate_per_kwh: number; currency: string };
export type Reading = {
  id: string;
  reading: number;
  previous_reading: number | null;
  consumption_kwh: number | null;
  rate_per_kwh: number;
  estimated_bill: number | null;
  was_manually_edited: boolean;
  scanned_at: string;
};

const num = (v: any) => (v == null ? null : Number(v));

export async function getProfile(userId: string): Promise<Profile> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (data) return { id: data.id, rate_per_kwh: Number(data.rate_per_kwh), currency: data.currency };
  return { id: userId, rate_per_kwh: 0, currency: 'PHP' };
}

export async function saveRate(userId: string, rate: number, currency: string) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, rate_per_kwh: rate, currency, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function listReadings(limit = 100): Promise<Reading[]> {
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .order('scanned_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    reading: Number(r.reading),
    previous_reading: num(r.previous_reading),
    consumption_kwh: num(r.consumption_kwh),
    rate_per_kwh: Number(r.rate_per_kwh),
    estimated_bill: num(r.estimated_bill),
    was_manually_edited: r.was_manually_edited,
    scanned_at: r.scanned_at,
  }));
}

export async function getLastReading(): Promise<number | null> {
  const { data } = await supabase
    .from('readings')
    .select('reading')
    .order('scanned_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.reading) : null;
}

export async function insertReading(row: {
  user_id: string;
  reading: number;
  previous_reading: number | null;
  consumption_kwh: number;
  rate_per_kwh: number;
  estimated_bill: number;
  ocr_raw: string | null;
  was_manually_edited: boolean;
}) {
  // scanned_at defaults to now() on the server (feature 10)
  const { error } = await supabase.from('readings').insert(row);
  if (error) throw error;
}

export async function deleteReading(id: string) {
  const { error } = await supabase.from('readings').delete().eq('id', id);
  if (error) throw error;
}

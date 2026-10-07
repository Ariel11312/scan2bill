import { supabase } from './supabase';

function parse(str: string) {
  const out: Record<string, string> = {};
  str.split('&').forEach((pair) => {
    const [k, v] = pair.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent((v ?? '').replace(/\+/g, ' '));
  });
  return out;
}

export async function handleAuthUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const [beforeHash, hash = ''] = url.split('#');
  const q = parse(beforeHash.split('?')[1] ?? '');
  const h = parse(hash);

  if (q.error_description || h.error_description) {
    return q.error_description || h.error_description;
  }
  if (q.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(q.code);
    return error?.message ?? null;
  }
  if (h.access_token && h.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: h.access_token,
      refresh_token: h.refresh_token,
    });
    return error?.message ?? null;
  }
  return null;
}
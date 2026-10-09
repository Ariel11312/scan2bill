import * as ImageManipulator from 'expo-image-manipulator';

// ---------------------------------------------------------------------------
// FREE TESTING SETUP
// 1) Get a free key at https://aistudio.google.com/apikey
// 2) Put it in your project's .env file:
//      EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
// 3) Restart Expo (npx expo start -c).
//
// NOTE: EXPO_PUBLIC_ keys ship inside the app bundle. Fine for testing, but
// for a real release move this call to a small backend so the key stays secret.
// ---------------------------------------------------------------------------
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

// Optional: force model(s) by name in .env (EXPO_PUBLIC_GEMINI_MODEL=...).
// You can give several, comma separated, in the order to try:
//   EXPO_PUBLIC_GEMINI_MODEL=gemini-2.5-flash,gemini-2.5-flash-lite
// Otherwise the app asks your key which models exist and picks Flash ones,
// so a retired model name can't cause a 404.
const FORCED_MODELS = (process.env.EXPO_PUBLIC_GEMINI_MODEL ?? '')
  .split(',')
  .map((s:any) => s.trim())
  .filter(Boolean);
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// ---------------------------------------------------------------------------
// OPTIONAL BACKUP PROVIDER (any OpenAI-compatible vision API)
// Used automatically whenever Gemini fails (daily quota, busy, etc.), so the
// free quotas of two providers stack. Put all three in .env to enable it:
//   EXPO_PUBLIC_ALT_API_BASE=https://api.groq.com/openai/v1
//   EXPO_PUBLIC_ALT_API_KEY=your_key
//   EXPO_PUBLIC_ALT_MODEL=<a vision-capable model name from that provider>
// Works with Groq, OpenRouter, Mistral, Together, a self-hosted vLLM/Ollama, etc.
// ---------------------------------------------------------------------------
const ALT_BASE = (process.env.EXPO_PUBLIC_ALT_API_BASE ?? '').replace(/\/$/, '');
const ALT_KEY = process.env.EXPO_PUBLIC_ALT_API_KEY ?? '';
const ALT_MODEL = process.env.EXPO_PUBLIC_ALT_MODEL ?? '';
const ALT_ENABLED = !!(ALT_BASE && ALT_KEY && ALT_MODEL);
let cachedModels: string[] = [];
// Models whose DAILY free quota is used up. Skipped for the rest of the session
// so we stop wasting requests (and waiting) on them.
const exhaustedModels = new Set<string>();
// Models that are overloaded (503) or too slow (timeout) right now. Skipped
// until the timestamp passes, so we don't hammer or wait on them again.
const coolOff = new Map<string, number>();
// Models that rejected the "thinkingConfig" field. We stop sending it to them.
const noThinkingConfig = new Set<string>();

const COOL_OFF_BUSY_MS = 60_000;
const COOL_OFF_RATE_MS = 30_000;

async function resolveModels(): Promise<string[]> {
  if (FORCED_MODELS.length) return FORCED_MODELS;
  if (cachedModels.length) return cachedModels;

  const res = await fetch(`${API_BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': API_KEY },
  });
  if (!res.ok) throw new Error(`ListModels failed (${res.status})`);
  const data = await res.json();

  const all: string[] = (data?.models ?? [])
    .filter((m: any) =>
      (m?.supportedGenerationMethods ?? []).includes('generateContent')
    )
    .map((m: any) => String(m.name).replace(/^models\//, ''))
    .filter(
      (n: string) =>
        /flash/i.test(n) &&
        !/(image|tts|live|audio|embedding|robotics|computer|8b)/i.test(n)
    );

  const main = all.filter((n) => !/lite/i.test(n));
  const lite = all.filter((n) => /lite/i.test(n));

  console.log('Gemini flash models available:', all.join(', '));
  if (!all.length) throw new Error('No Flash model available for this key');

  // Prefer stable names (no "preview"/"exp"), then the highest version.
  const score = (n: string) => {
    const v = parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? '0');
    const stable = /(preview|exp)/i.test(n) ? 0 : 1;
    return stable * 100 + v;
  };
  main.sort((a, b) => score(b) - score(a));
  lite.sort((a, b) => score(b) - score(a));

  // Top 3 regular Flash models, then up to 2 Lite models as a last resort.
  // Different models are overloaded at different times, so more fallbacks help.
  cachedModels = [...main.slice(0, 3), ...lite.slice(0, 2)];
  console.log('Gemini models to try, in order:', cachedModels.join(', '));
  return cachedModels;
}

// The on-screen frame, as fractions of the SCREEN (ScanScreen draws it).
// It must include BOTH LCD rows and the "kWh" label. A little loose is fine,
// because the model is told to ignore everything except the kWh register.
export type MeterMode = 'digital' | 'analog';
export const CROPS: Record<MeterMode, { x: number; y: number; w: number; h: number }> = {
  // LCD: two rows plus the kWh label.
  digital: { x: 0.08, y: 0.27, w: 0.84, h: 0.2 },
  // Mechanical register: the black cover disc plus 4 dials is about 2.7:1.
  // Keep this frame close to that shape so the dials fill the crop.
  analog: { x: 0.05, y: 0.32, w: 0.9, h: 0.15 },
};
// Kept for backward compatibility (digital frame).
export const CROP = CROPS.digital;

export type ViewSize = { viewW: number; viewH: number };

// The photo is shown with resizeMode="cover", so part of it is cut off on
// screen. This converts the on-screen frame into the matching photo region.
function frameToPhotoCrop(
  W: number,
  H: number,
  view?: ViewSize,
  frame: typeof CROP = CROP
) {
  if (!view || !view.viewW || !view.viewH) return frame;
  const scale = Math.max(view.viewW / W, view.viewH / H);
  const dw = W * scale;
  const dh = H * scale;
  const ox = (dw - view.viewW) / 2;
  const oy = (dh - view.viewH) / 2;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const x = clamp((frame.x * view.viewW + ox) / dw);
  const y = clamp((frame.y * view.viewH + oy) / dh);
  const w = Math.min(1 - x, (frame.w * view.viewW) / dw);
  const h = Math.min(1 - y, (frame.h * view.viewH) / dh);
  return { x, y, w, h };
}

const MIN_DIGITS = 3;
const MAX_DIGITS = 8;
const TIMEOUT_MS = 20000; // digital: small image, short prompt
const ANALOG_TIMEOUT_MS = 35000; // analog: bigger image, longer prompt
const TIER_DEADLINE_MS = 90000; // stop starting new tries in one tier after this
const TARGET_WIDTH = 900;

export type ScanOutcome =
  | { ok: true; value: number; raw: string; warn?: string }
  | { ok: false; error: string };

// Meralco bills on the WHOLE-kWh "Present Reading" shown on the LCD, so the
// value returned is the big top-row number only. (The small row is usually a
// display code/ID, not part of the reading.)
// Set true only if your meter really shows a decimal point in the big row.
const USE_DECIMALS = false;

// The LCD cycles through screens (kWh, voltage, date, ...). Only accept a
// reading when the "kWh" label is visible, so we never grab another screen.
const REQUIRE_KWH_LABEL = true;

const PROMPT = `This is a photo of a Meralco electric meter's LCD display.
Read the total energy register (the "Present Reading") exactly as displayed:
- "integer": the large digits on the top row. Keep leading zeros.
- "decimals": digits after a decimal point in that same large row, only if a decimal point is clearly visible. Otherwise "".
- "code": the smaller digits on the row below the large digits (a display code, not part of the reading). "" if none.
- "unit": the unit label on the LCD, for example "kWh". "" if no unit label is visible.
Rules:
- Ignore all printed text on the meter body (brand, CL200, 240V, serial numbers, barcodes).
- Ignore icons and symbols.
- Do not guess. If the large digits are not clearly readable, return "" for integer.
Respond as JSON: {"integer": "<digits>", "decimals": "<digits>", "code": "<digits>", "unit": "<text>"}`;

// ---------------------------------------------------------------------------
// ANALOG (pointer dials / rolling wheels)
//
// How precision is achieved:
//  1. The model only REPORTS what it sees per dial (direction, last digit the
//     tip passed, how far toward the next digit). It never forms the number.
//  2. The app asks up to 3 times and combines the answers (circular median), so
//     one bad guess cannot change the result.
//  3. The app turns pointer positions into digits itself, using the carry rule
//     (each dial must agree with the dial to its right), cascading right-to-left.
//  4. Sanity checks (alternating dial directions, "next" digit matches, samples
//     agree, pointer not on a digit boundary) set the warning flag.
// ---------------------------------------------------------------------------
const ANALOG_PROMPT = `This is a photo of a Meralco mechanical electric meter register (kilowatt-hours).
It has up to 5 small round dials in a row, each with a black teardrop-shaped pointer. A large blank black disc at the far left is only a cover: it is NOT a dial, skip it. Some meters have rolling number wheels instead of dials.

If the register has POINTER DIALS (type "dials"):
Go through EVERY real dial from LEFT to RIGHT, including the rightmost dial (the units dial; never skip it). For each dial, do these steps in order:
1. "increasing": look at that dial's own printed numbers. Going from 0 to 1, do you move clockwise ("cw") or counter-clockwise ("ccw")? Neighbouring dials usually turn in opposite directions, so check each dial separately and never copy the neighbour.
2. Find the pointer TIP: the narrow pointed end, far from the round hub in the middle of the dial. Ignore the wide tail. If the tip covers a printed digit, the tip is on that digit.
3. "passed": the last digit (0-9) that the tip has reached or crossed, moving in that dial's increasing direction.
4. "next": the digit after "passed" in that dial's increasing direction (after 9 comes 0).
5. "progress": how far the tip is from "passed" toward "next", from 0.0 (exactly on "passed") to 0.99 (almost at "next"). The 10 digits are 36 degrees apart, so judge by angle.
Examples: exactly on 3 -> passed 3, progress 0.0. Halfway between 3 and 4 -> passed 3, progress 0.5. Just before reaching 4 -> passed 3, progress 0.9. Just past 9 toward 0 -> passed 9, progress 0.2.
Do NOT combine the dials into a number yourself. Only report each dial's pointer.

If the register has ROLLING WHEELS (type "drums"):
- Return "digits" as the digits left to right, keeping leading zeros. Use the lower digit when a wheel is between two.

Rules:
- Ignore printed text and numbers on the meter (MERALCO, Rr, CL100, 240V, Kh, serial numbers) and the spinning disc.
- Set "uncertain" to true if any dial or wheel was hard to see (glare, blur, pointer hidden).
- Do not guess. If the register is not readable, return an empty "dials" array and empty "digits".
Respond as JSON only, in this shape:
{"type": "dials", "dials": [{"increasing": "ccw", "passed": 0, "next": 1, "progress": 0.0}, {"increasing": "cw", "passed": 0, "next": 1, "progress": 0.8}], "digits": "", "uncertain": false}`;

const ANALOG_MIN_DIGITS = 4;
const ANALOG_MAX_DIGITS = 6;
// Dials need more detail than the LCD, but a huge image makes every call slow
// and is a main cause of timeouts. 1000 px wide is a good balance.
// Raise toward 1400 only if dial reading accuracy drops.
const ANALOG_TARGET_WIDTH = 1000;
const ANALOG_JPEG_QUALITY = 0.85;
// Adaptive sampling: scan once; only scan again (up to this many times) when
// the first read looks unsure. A clean read costs just 1 API request.
const ANALOG_MAX_SAMPLES = 3;
const ANALOG_TEMPERATURES = [0, 0.3, 0.3]; // temperature for scan 1, 2, 3
const MAX_SAMPLE_SPREAD = 0.6; // samples further apart than this = unsure
const MAX_CARRY_RESIDUAL = 0.35; // dial disagrees with the dial to its right

// --- circular helpers (a dial is a loop of length 10) ----------------------
const mod10 = (v: number) => ((v % 10) + 10) % 10;
/** Signed shortest difference a - b on the 0..10 loop, in (-5, 5]. */
function circDiff(a: number, b: number): number {
  let d = mod10(a - b);
  if (d > 5) d -= 10;
  return d;
}
const circDist = (a: number, b: number) => Math.abs(circDiff(a, b));

/**
 * Turns pointer positions (0-9.99, left to right) into digits.
 *
 * Cascades from the right: the units dial is floored; every dial to the left
 * must equal (its digit + the continuous value of all dials to its right).
 * This is the standard "pointer on a number, check the dial to the right" rule,
 * done numerically, and it uses the already-corrected digits, not noisy ones.
 */
export function dialsToDigits(pos: number[]): { digits: string; shaky: boolean } {
  const n = pos.length;
  const digits: number[] = new Array(n);
  let shaky = false;

  const last = mod10(pos[n - 1]);
  digits[n - 1] = Math.floor(last) % 10;
  const lastFrac = last - Math.floor(last);
  // Pointer almost on a digit on the units dial: floor vs ceil is a coin flip.
  if (lastFrac > 0.85 || lastFrac < 0.15) shaky = true;

  // Continuous value of everything to the right, in units of the next dial.
  let lower = last / 10;
  for (let i = n - 2; i >= 0; i--) {
    const r = circDiff(pos[i], lower); // where this dial is vs where it should sit
    const rounded = Math.round(r);
    digits[i] = mod10(rounded);
    if (Math.abs(r - rounded) > MAX_CARRY_RESIDUAL) shaky = true;
    lower = (digits[i] + lower) / 10;
  }
  return { digits: digits.join(''), shaky };
}

/**
 * Combines several readings of the same dials. Per dial it takes the circular
 * median (robust to one wild answer) and averages the answers near it.
 * `spread` = largest disagreement between any sample and the result.
 */
export function combineDialSamples(samples: number[][]): { pos: number[]; spread: number } {
  const n = samples[0].length;
  const pos: number[] = [];
  let spread = 0;
  for (let j = 0; j < n; j++) {
    const vals = samples.map((s) => s[j]);
    let best = vals[0];
    let bestCost = Infinity;
    for (const v of vals) {
      const cost = vals.reduce((a, w) => a + circDist(v, w), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
    }
    const near = vals.filter((v) => circDist(v, best) <= 0.5);
    const offset = near.reduce((a, v) => a + circDiff(v, best), 0) / near.length;
    const merged = mod10(best + offset);
    pos.push(merged);
    for (const v of vals) spread = Math.max(spread, circDist(v, merged));
  }
  return { pos, spread };
}

type DialSample = { pos: number[]; dirs: string[]; flaky: boolean; uncertain: boolean };

/** Reads one model answer into pointer positions. Returns null if unusable. */
function parseDialSample(parsed: any): DialSample | null {
  const raw = Array.isArray(parsed?.dials) ? parsed.dials : [];
  const pos: number[] = [];
  const dirs: string[] = [];
  let flaky = false;

  for (const item of raw) {
    // Accept the new object format and a plain number (older format).
    if (typeof item === 'number' || typeof item === 'string') {
      const v = Number(item);
      if (!Number.isFinite(v)) return null;
      pos.push(mod10(v));
      dirs.push('');
      continue;
    }
    const passed = Math.round(Number(item?.passed));
    if (!Number.isFinite(passed) || passed < 0 || passed > 9) return null;
    let progress = Number(item?.progress ?? 0);
    if (!Number.isFinite(progress)) progress = 0;
    progress = Math.min(0.99, Math.max(0, progress));

    if (item?.next !== undefined && item?.next !== null) {
      if (Math.round(Number(item.next)) !== (passed + 1) % 10) flaky = true;
    }
    const d = String(item?.increasing ?? '').toLowerCase();
    dirs.push(/(ccw|counter|anti)/.test(d) ? 'ccw' : /(cw|clock)/.test(d) ? 'cw' : '');
    pos.push(passed + progress);
  }

  if (pos.length < ANALOG_MIN_DIGITS || pos.length > ANALOG_MAX_DIGITS) return null;
  const uncertain = parsed?.uncertain === true || parsed?.uncertain === 'true';
  return { pos, dirs, flaky, uncertain };
}

/** Neighbouring dials must turn in opposite directions. */
function directionsAlternate(dirs: string[]): boolean {
  const known = dirs.map((d, i) => ({ d, i })).filter((x) => x.d);
  if (known.length < 2) return true; // nothing to check
  return known.every((x) => x.d === (x.i % 2 === known[0].i % 2 ? known[0].d : known[0].d === 'cw' ? 'ccw' : 'cw'));
}

function mostCommon<T>(items: T[], key: (t: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  let best: T[] = [];
  groups.forEach((g) => {
    if (g.length > best.length) best = g;
  });
  return best;
}

// ---------------------------------------------------------------------------
// Gemini call with retry + model fallback
// ---------------------------------------------------------------------------
type GeminiCall =
  | { ok: true; text: string; lowAccuracy?: boolean }
  | { ok: false; error: string };

/** Which models a call may use. */
type Tier = 'full' | 'lite' | 'all';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGeminiOnly(
  prompt: string,
  base64: string,
  temperature: number,
  tier: Tier,
  timeoutMs: number
): Promise<GeminiCall> {
  if (!API_KEY) {
    return { ok: false, error: 'Missing EXPO_PUBLIC_GEMINI_API_KEY. Add it to .env and restart.' };
  }
  let models: string[];
  try {
    models = await resolveModels();
  } catch (e: any) {
    return { ok: false, error: `Scan error: ${e?.message ?? String(e)}` };
  }

  // Keep only the models of the requested tier. (Lite models are weak at
  // reading dials, so analog tries full models first and lite only afterwards.)
  const ofTier = models.filter((m) => {
    const isLite = /lite/i.test(m);
    return tier === 'all' || (tier === 'lite' ? isLite : !isLite);
  });
  if (!ofTier.length) {
    return { ok: false, error: 'No usable model found. Set EXPO_PUBLIC_GEMINI_MODEL in .env.' };
  }

  // Skip models with no daily quota left.
  const withQuota = ofTier.filter((m) => !exhaustedModels.has(m));
  if (!withQuota.length) {
    return {
      ok: false,
      error:
        'Free daily Gemini quota is used up for all models. It resets within about a day. Try again later, or use a key with billing enabled.',
    };
  }

  // Skip models that are busy / slow right now. If that would leave none,
  // try them anyway (the spike may be over).
  const now = Date.now();
  const rested = withQuota.filter((m) => (coolOff.get(m) ?? 0) <= now);
  models = rested.length ? rested : withQuota;

  const makeBody = (model: string) =>
    JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature,
        responseMimeType: 'application/json',
        // Reading a photo does not need long "thinking". Turning it off is the
        // biggest speed-up and avoids most timeouts.
        ...(noThinkingConfig.has(model) ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
      },
    });

  const RETRIES_PER_MODEL = 2; // 503 gets one quick retry, then we move on
  const startedAt = Date.now();
  let res: Response | null = null;
  let sawBusy = false;
  let sawQuota = false;
  let saw404 = false;
  let sawTimeout = false;

  outer: for (const model of models) {
    for (let attempt = 1; attempt <= RETRIES_PER_MODEL; attempt++) {
      if (Date.now() - startedAt > TIER_DEADLINE_MS) break outer;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch(`${API_BASE}/models/${model}:generateContent`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': API_KEY,
          },
          body: makeBody(model),
        });

        if (r.ok) {
          console.log(`Gemini OK with ${model}`);
          res = r;
          break outer;
        }

        const errBody = await r.text();
        console.log(`Gemini ${r.status} on ${model} (try ${attempt}):`, errBody);

        if (r.status === 400 || r.status === 403) {
          // This model does not accept thinkingConfig: remember and retry
          // the same model without it. This is NOT a bad-key error.
          if (r.status === 400 && /thinking/i.test(errBody) && !noThinkingConfig.has(model)) {
            noThinkingConfig.add(model);
            attempt--; // free retry, does not count
            continue;
          }
          if (/expired/i.test(errBody)) {
            return {
              ok: false,
              error:
                'Your Gemini API key has expired. Create a new key, put it in .env, then restart with: npx expo start -c',
            };
          }
          if (/(API_KEY_INVALID|API key not valid)/i.test(errBody)) {
            return {
              ok: false,
              error: 'Gemini API key is not valid. Check EXPO_PUBLIC_GEMINI_API_KEY in .env, then restart with: npx expo start -c',
            };
          }
          return { ok: false, error: 'API key or request rejected. Check your key.' };
        }
        if (r.status === 404) {
          saw404 = true;
          cachedModels = [];
          break; // try next model
        }
        if (r.status === 429) {
          // Quota/rate limit: another model may have its own quota.
          // A per-DAY limit will not clear by retrying, so remember it.
          sawQuota = true;
          if (/PerDay/i.test(errBody)) exhaustedModels.add(model);
          else coolOff.set(model, Date.now() + COOL_OFF_RATE_MS);
          break;
        }
        // 500 / 503 / 504: this model is overloaded.
        sawBusy = true;
        if (attempt < RETRIES_PER_MODEL) {
          await sleep(1500);
          continue;
        }
        coolOff.set(model, Date.now() + COOL_OFF_BUSY_MS);
        break; // next model
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          // Too slow: retrying the same slow model rarely helps. Move on.
          console.log(`Gemini timeout on ${model} after ${timeoutMs} ms`);
          sawTimeout = true;
          coolOff.set(model, Date.now() + COOL_OFF_BUSY_MS);
          break;
        }
        console.log(`Gemini network error on ${model} (try ${attempt}):`, e?.name, e?.message);
        if (attempt < RETRIES_PER_MODEL) await sleep(1000);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  if (!res) {
    if (sawBusy) {
      return {
        ok: false,
        error: 'Gemini is busy right now. Wait a few seconds and tap retry.',
      };
    }
    if (sawQuota) {
      return { ok: false, error: 'Free quota reached. Wait a minute and retry.' };
    }
    if (saw404) {
      return {
        ok: false,
        error: 'No usable model found. Set EXPO_PUBLIC_GEMINI_MODEL in .env.',
      };
    }
    if (sawTimeout) {
      return { ok: false, error: 'Timed out. Check your connection and retry.' };
    }
    return { ok: false, error: 'Could not reach Gemini. Check your connection and retry.' };
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '';
  return { ok: true, text };
}

/** Pulls the JSON object out of a reply that may be wrapped in ``` fences or prose. */
function extractJson(text: string): string {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  return a >= 0 && b > a ? text.slice(a, b + 1) : text;
}

/** Backup: any OpenAI-compatible chat/completions endpoint with image input. */
async function callOpenAICompat(
  prompt: string,
  base64: string,
  temperature: number,
  timeoutMs: number
): Promise<GeminiCall> {
  if (!ALT_ENABLED) return { ok: false, error: 'No backup provider configured.' };

  const makeBody = (withJsonMode: boolean) =>
    JSON.stringify({
      model: ALT_MODEL,
      temperature,
      ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          ],
        },
      ],
    });

  let jsonMode = true;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(`${ALT_BASE}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ALT_KEY}` },
        body: makeBody(jsonMode),
      });
      lastStatus = r.status;
      if (r.ok) {
        const data = await r.json();
        const text = String(data?.choices?.[0]?.message?.content ?? '');
        console.log(`Backup provider OK (${ALT_MODEL})`);
        return { ok: true, text: extractJson(text) };
      }
      const errBody = await r.text();
      console.log(`Backup ${r.status} (try ${attempt}):`, errBody);
      if (r.status === 400 && jsonMode) {
        jsonMode = false; // this model may not support JSON mode: retry without it
        continue;
      }
      if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 429) break;
      await sleep(1500 * attempt);
    } catch (e: any) {
      lastStatus = 0;
      console.log('Backup network/timeout:', e?.name);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    ok: false,
    error:
      lastStatus === 429
        ? 'Backup provider quota reached. Wait a minute and retry.'
        : 'Backup provider failed. Check your connection and retry.',
  };
}

/**
 * Tries, in order:
 *   digital: any Gemini Flash model -> backup provider
 *   analog:  full Flash models -> Lite models (flagged low accuracy) -> backup
 * A busy or slow model is skipped quickly, so the next option starts soon.
 */
async function callGemini(
  prompt: string,
  base64: string,
  temperature: number,
  analog: boolean
): Promise<GeminiCall> {
  const timeoutMs = analog ? ANALOG_TIMEOUT_MS : TIMEOUT_MS;
  let g: GeminiCall = { ok: false, error: 'Missing EXPO_PUBLIC_GEMINI_API_KEY. Add it to .env and restart.' };

  if (API_KEY) {
    if (analog) {
      g = await callGeminiOnly(prompt, base64, temperature, 'full', timeoutMs);
      if (g.ok) return g;
      console.log('Full Gemini models failed:', g.error);
      // Fatal key problems will not be fixed by another model.
      if (/(API key|key has expired|key is not valid)/i.test(g.error)) {
        if (!ALT_ENABLED) return g;
      } else {
        const lite = await callGeminiOnly(prompt, base64, temperature, 'lite', timeoutMs);
        if (lite.ok) return { ...lite, lowAccuracy: true };
        console.log('Lite Gemini models failed:', lite.error);
      }
    } else {
      g = await callGeminiOnly(prompt, base64, temperature, 'all', timeoutMs);
      if (g.ok) return g;
    }
  }

  if (!ALT_ENABLED) return g;
  console.log('Gemini failed, trying backup provider:', g.ok ? '' : g.error);
  const a = await callOpenAICompat(prompt, base64, temperature, timeoutMs);
  if (a.ok) return a;
  return API_KEY ? g : a;
}

// ---------------------------------------------------------------------------
// Analog reading from several model answers
// ---------------------------------------------------------------------------
function readAnalogAnswers(texts: string[], requested: number): ScanOutcome {
  const parsedAll: any[] = [];
  for (const t of texts) {
    try {
      parsedAll.push(JSON.parse(t));
    } catch {
      // ignore unparsable answers
    }
  }
  if (!parsedAll.length) {
    return {
      ok: false,
      error: 'Could not read all the dials. Move closer so the dials fill the frame, avoid glare, and retake.',
    };
  }

  const isDrums = (p: any) => p?.type === 'drums';
  const drumVotes = parsedAll.filter(isDrums).length;

  // ---- Rolling wheels: majority vote on the digit string ----
  if (drumVotes > parsedAll.length / 2) {
    const strings = parsedAll
      .filter(isDrums)
      .map((p) => String(p?.digits ?? '').replace(/\D/g, ''))
      .filter((s) => s.length >= ANALOG_MIN_DIGITS && s.length <= ANALOG_MAX_DIGITS);
    if (!strings.length) {
      return { ok: false, error: 'Could not read the wheels. Move closer and retake.' };
    }
    const winners = mostCommon(strings, (s) => s);
    const digits = winners[0];
    const unsure = winners.length < strings.length || strings.length < 2;
    return {
      ok: true,
      value: parseInt(digits, 10),
      raw: `${digits} kWh`,
      warn: unsure ? 'The readings did not fully agree. Please check the number against the meter.' : undefined,
    };
  }

  // ---- Pointer dials ----
  const samples = parsedAll
    .filter((p) => !isDrums(p))
    .map(parseDialSample)
    .filter((s): s is DialSample => s !== null);

  if (!samples.length) {
    return {
      ok: false,
      error: 'Could not read all the dials. Move closer so the dials fill the frame, avoid glare, and retake.',
    };
  }

  // Keep only the answers that found the same number of dials.
  const sameCount = mostCommon(samples, (s) => String(s.pos.length));
  const { pos, spread } = combineDialSamples(sameCount.map((s) => s.pos));
  const { digits, shaky } = dialsToDigits(pos);

  // Majority direction per dial, then check that neighbours alternate.
  const dirs = pos.map((_, j) => {
    const votes = sameCount.map((s) => s.dirs[j]).filter(Boolean);
    return votes.length ? mostCommon(votes, (v) => v)[0] : '';
  });

  const reasons: string[] = [];
  if (shaky) reasons.push('a pointer is very close to a number');
  if (spread > MAX_SAMPLE_SPREAD) reasons.push('the scans disagreed');
  if (sameCount.length < samples.length) reasons.push('the dial count changed between scans');
  if (sameCount.some((s) => s.flaky)) reasons.push('a pointer position was inconsistent');
  if (sameCount.some((s) => s.uncertain)) reasons.push('a dial was hard to see');
  if (!directionsAlternate(dirs)) reasons.push('dial directions look wrong');

  console.log('ANALOG pos:', pos.map((p) => p.toFixed(2)).join(' '), 'digits:', digits, 'spread:', spread.toFixed(2), 'reasons:', reasons);

  if (digits.length < ANALOG_MIN_DIGITS || digits.length > ANALOG_MAX_DIGITS) {
    return {
      ok: false,
      error: 'Could not read all the dials. Move closer so the dials fill the frame, avoid glare, and retake.',
    };
  }

  return {
    ok: true,
    value: parseInt(digits, 10),
    raw: `${digits} kWh`,
    warn: reasons.length
      ? `Please check the number against the meter (${reasons.join('; ')}).`
      : undefined,
  };
}

export async function readMeter(
  photoUri: string,
  _width: number,
  _height: number,
  view?: ViewSize,
  modeArg: MeterMode = 'digital',
  allowAutoSwitch = true
): Promise<ScanOutcome> {
  // Tolerate readMeter(uri, w, h, 'analog') (mode passed as the 4th argument).
  let mode: MeterMode = modeArg;
  if ((view as unknown) === 'analog' || (view as unknown) === 'digital') {
    mode = view as unknown as MeterMode;
    view = undefined;
  }
  console.log('readMeter mode:', mode);
  // Shows which key the running bundle really contains. If this does not match
  // your new key, the app was not restarted with a cleared cache.
  console.log('Gemini key in use: ...' + (API_KEY ? API_KEY.slice(-4) : '(none)'));
  try {
    if (!API_KEY && !ALT_ENABLED) {
      return {
        ok: false,
        error: 'Missing EXPO_PUBLIC_GEMINI_API_KEY. Add it to .env and restart.',
      };
    }

    // 1) Normalize orientation and get true pixel size.
    const base = await ImageManipulator.manipulateAsync(photoUri, [], {
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const W = base.width;
    const H = base.height;
    if (!W || !H) {
      return { ok: false, error: 'Could not read the photo. Retake.' };
    }

    // 2) Crop (clamped) and shrink to keep the upload small and fast.
    const c = frameToPhotoCrop(W, H, view, CROPS[mode]);
    const originX = Math.max(0, Math.round(W * c.x));
    const originY = Math.max(0, Math.round(H * c.y));
    const cw = Math.min(Math.round(W * c.w), W - originX);
    const ch = Math.min(Math.round(H * c.h), H - originY);
    if (cw <= 0 || ch <= 0) {
      return { ok: false, error: 'Crop region is empty. Check CROP constants.' };
    }

    const actions: ImageManipulator.Action[] = [
      { crop: { originX, originY, width: cw, height: ch } },
    ];
    const targetW = mode === 'analog' ? ANALOG_TARGET_WIDTH : TARGET_WIDTH;
    if (cw > targetW) actions.push({ resize: { width: targetW } });

    const crop = await ImageManipulator.manipulateAsync(base.uri, actions, {
      compress: mode === 'analog' ? ANALOG_JPEG_QUALITY : 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (!crop.base64) {
      return { ok: false, error: 'Could not encode the image. Retake.' };
    }

    // Resolve the Gemini model list once. If it fails, the backup still works.
    if (API_KEY) {
      try {
        await resolveModels();
      } catch (e) {
        console.log('resolveModels failed:', e);
      }
    }

    // 3a) Analog: scan once; re-scan only if the read looks unsure, then
    //     combine the answers. Clean photo = 1 request.
    if (mode === 'analog') {
      const texts: string[] = [];
      let lastError = '';
      let outcome: ScanOutcome | null = null;
      let usedLite = false;

      for (let i = 0; i < ANALOG_MAX_SAMPLES; i++) {
        // callGemini handles the whole chain: full Flash -> Lite -> backup.
        const r = await callGemini(
          ANALOG_PROMPT,
          crop.base64,
          ANALOG_TEMPERATURES[i] ?? 0.3,
          true
        );
        if (!r.ok) {
          lastError = r.error;
          break; // every option failed: more tries would not help
        }
        if (r.lowAccuracy) usedLite = true;
        texts.push(r.text);
        console.log(`GEMINI RAW (analog ${i + 1}):`, r.text);

        outcome = readAnalogAnswers(texts, ANALOG_MAX_SAMPLES);
        if (outcome.ok && !outcome.warn) break; // confident, stop early
      }

      if (outcome) {
        // best answer so far (may carry a warning)
        if (usedLite && outcome.ok) {
          return {
            ...outcome,
            warn: 'Read with a lower-accuracy model because the main models were busy or out of quota. Check every dial against the meter.',
          };
        }
        return outcome;
      }
      return { ok: false, error: lastError || 'Scan failed. Retry.' };
    }

    // 3b) Digital: one read.
    const call = await callGemini(PROMPT, crop.base64, 0, false);
    if (!call.ok) return { ok: false, error: call.error };
    const text = call.text;
    console.log('GEMINI RAW:', text);

    // 4) Digital meters: parse and validate.
    let intPart = '';
    let decPart = '';
    let unit = '';
    try {
      const parsed = JSON.parse(text);
      intPart = String(parsed?.integer ?? '').replace(/\D/g, '');
      decPart = String(parsed?.decimals ?? '').replace(/\D/g, '');
      unit = String(parsed?.unit ?? '').trim();
    } catch {
      intPart = text.replace(/\D/g, '');
    }

    if (intPart.length < MIN_DIGITS || intPart.length > MAX_DIGITS) {
      // Nothing LCD-like was found. This is what happens when a dial meter is
      // scanned in digital mode (the model only sees the printed
      // "KILOWATTHOURS" label), so try once as an analog meter.
      if (allowAutoSwitch && intPart.length === 0) {
        console.log('No LCD digits found, retrying as analog meter');
        const analog = await readMeter(photoUri, _width, _height, view, 'analog', false);
        if (analog.ok) {
          return {
            ...analog,
            warn: analog.warn ?? 'Read as a dial meter. Please check the number against the meter.',
          };
        }
      }
      return {
        ok: false,
        error:
          'Could not read the kWh number clearly. Retake. (Dial meter? Switch the scan mode to Analog.)',
      };
    }

    if (REQUIRE_KWH_LABEL && !/kwh/i.test(unit)) {
      return {
        ok: false,
        error:
          'The kWh screen is not showing. Wait for the meter to show "kWh" and retry.',
      };
    }

    const useDec = USE_DECIMALS && decPart.length > 0;
    const value = useDec
      ? parseFloat(`${intPart}.${decPart}`)
      : parseInt(intPart, 10);
    if (!Number.isFinite(value)) {
      return { ok: false, error: 'The reading could not be read. Retake.' };
    }

    const rawText = useDec ? `${intPart}.${decPart}` : intPart;
    return { ok: true, value, raw: unit ? `${rawText} ${unit}` : rawText };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { ok: false, error: 'Timed out. Check your connection and retry.' };
    }
    console.log('readMeter ERROR:', e);
    return { ok: false, error: `Scan error: ${e?.message ?? String(e)}` };
  }
}
export type ComputeResult =
  | { ok: true; consumption: number; bill: number; rolledOver: boolean }
  | { ok: false; error: string };

export const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Data validation + consumption + bill estimation (features 6, 7, 14). */
export function validateAndCompute(
  current: number,
  previous: number | null,
  rate: number,
  digits = 5,
  maxReasonableKwh = 2000
): ComputeResult {
  if (!Number.isFinite(current) || current < 0) return { ok: false, error: 'Enter a valid reading.' };
  if (!(rate > 0)) return { ok: false, error: 'Set your electricity rate in Settings first.' };

  if (previous === null) return { ok: true, consumption: 0, bill: 0, rolledOver: false };

  let consumption = current - previous;
  let rolledOver = false;
  if (consumption < 0) {
    const wrapped = Math.pow(10, digits) - previous + current;
    if (wrapped <= maxReasonableKwh) {
      consumption = wrapped;
      rolledOver = true;
    } else {
      return { ok: false, error: 'This reading is lower than the previous one. Retake the scan or correct the digits.' };
    }
  }
  if (consumption > maxReasonableKwh) {
    return { ok: false, error: `${consumption.toFixed(1)} kWh since the last reading looks too high. Check the digits.` };
  }
  return { ok: true, consumption: round(consumption, 1), bill: round(consumption * rate, 2), rolledOver };
}

export const money = (n: number | null | undefined, currency = 'PHP') =>
  n == null
    ? '—'
    : `${currency === 'PHP' ? '₱' : currency + ' '}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';

// Must match the alignment frame drawn on ScanScreen (fractions of the photo).
export const CROP = { x: 0.08, y: 0.4, w: 0.84, h: 0.2 };
const MIN_DIGITS = 4;
const MAX_DIGITS = 8;

export type ScanOutcome = { ok: true; value: number; raw: string } | { ok: false; error: string };

export async function readMeter(photoUri: string, _width: number, _height: number): Promise<ScanOutcome> {
  try {
    if (!TextRecognition?.recognize) {
      return { ok: false, error: 'ML Kit is not available. Use a development build, not Expo Go.' };
    }

    // 1) Normalize orientation and get the true pixel size.
    const base = await ImageManipulator.manipulateAsync(photoUri, [], {
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const W = base.width, H = base.height;

    // 2) Crop (clamped so it can never go out of bounds) and upscale.
    const originX = Math.max(0, Math.round(W * CROP.x));
    const originY = Math.max(0, Math.round(H * CROP.y));
    const cw = Math.min(Math.round(W * CROP.w), W - originX);
    const ch = Math.min(Math.round(H * CROP.h), H - originY);

    const crop = await ImageManipulator.manipulateAsync(
      base.uri,
      [{ crop: { originX, originY, width: cw, height: ch } }, { resize: { width: 1400 } }],
      { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
    );

    // 3) OCR
    const result = await TextRecognition.recognize(crop.uri);
    const raw = result.text ?? '';

    // 4) Work per line (never join across newlines); prefer the tallest line.
    const lines = (result.blocks ?? []).flatMap((b: any) => b.lines ?? []);
    const candidates = lines
      .map((l: any) => ({
        digits: String(l.text ?? '').replace(/[^\d.,]/g, '').replace(',', '.'),
        h: l.frame?.height ?? 0,
      }))
      .filter((c) => {
        const n = c.digits.replace('.', '').length;
        return n >= MIN_DIGITS && n <= MAX_DIGITS;
      })
      .sort((a, b) => b.h - a.h);

    if (!candidates.length) {
      return { ok: false, error: `No reading recognized. OCR saw: "${raw.replace(/\n/g, ' ').slice(0, 40)}"` };
    }
    const value = parseFloat(candidates[0].digits);
    if (!Number.isFinite(value)) return { ok: false, error: 'The reading could not be read clearly. Retake.' };
    return { ok: true, value, raw };
  } catch (e: any) {
    console.log('readMeter ERROR:', e);
    return { ok: false, error: `Scan error: ${e?.message ?? String(e)}` };
  }
}
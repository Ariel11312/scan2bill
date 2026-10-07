# MeterScan

React Native (Expo) + Supabase + NativeWind (Tailwind CSS). Scans an electric meter, reads the digits on-device with ML Kit, and estimates the bill.

## Setup
1. Create a Supabase project, then run `supabase/schema.sql` in the SQL editor.
2. (Optional, easier testing) Authentication > Providers > Email: turn off "Confirm email".
3. `cp .env.example .env` and fill in your project URL and anon key.
4. `npm install`
5. ML Kit is native code, so Expo Go will not work. Build a dev client:
   - `npx expo run:android` (or `npx expo run:ios` on a Mac)
6. `npm start`

## Tuning OCR
- The alignment frame is defined by `CROP` in `src/lib/ocr.ts` and drawn in `ScanScreen.tsx`. Adjust to your meter.
- `validateAndCompute(..., digits = 5)` in `src/lib/calc.ts`: set `digits` to the number of wheels on your meter (used for rollover detection).
- Every saved reading stores `ocr_raw` and `was_manually_edited`, so you can measure accuracy in Supabase.

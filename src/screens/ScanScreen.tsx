import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, LayoutChangeEvent, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { Button, ErrorBanner } from '../components/ui';
// Save readMeterVision.ts as src/lib/readMeterVision.ts (or change this path).
import { CROPS, MeterMode, readMeter } from '../lib/ocr';

type Captured = {
  uri: string;
  width: number;
  height: number;
};

export default function ScanScreen() {
  const nav = useNavigation<any>();
  const cam = useRef<CameraView>(null);
  const [perm, requestPerm] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Size of the screen area, needed to map the on-screen frame onto the photo.
  const [viewSize, setViewSize] = useState<{ viewW: number; viewH: number }>({
    viewW: 0,
    viewH: 0,
  });

  // Frozen photo once captured; null means live camera.
  const [captured, setCaptured] = useState<Captured | null>(null);

  // Result for the frozen photo.
  const [reading, setReading] = useState<number | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [warn, setWarn] = useState<string | null>(null);

  // Digital LCD or analog (mechanical) meter.
  const [mode, setMode] = useState<MeterMode>('digital');
  const CROP = CROPS[mode];

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setViewSize({ viewW: width, viewH: height });
  }

  if (!perm) return <View className="flex-1 bg-ink" />;
  if (!perm.granted) {
    return (
      <View className="flex-1 bg-paper justify-center px-6">
        <Text className="text-xl font-bold text-ink mb-2">Camera access needed</Text>
        <Text className="text-muted mb-6">
          MeterScan reads your meter from a photo. The cropped meter display is sent
          to an AI service to read the digits.
        </Text>
        <Button label="Allow camera" onPress={() => requestPerm()} />
      </View>
    );
  }

  // Read the kWh from a photo (used by capture and by "Read again").
  async function runRead(shot: Captured) {
    setBusy(true);
    setError(null);
    setReading(null);
    setRawText('');
    setWarn(null);
    try {
      const out = await readMeter(shot.uri, shot.width, shot.height, viewSize, mode);
      if (!out.ok) {
        setError(out.error);
      } else {
        setReading(out.value);
        setRawText(out.raw);
        setWarn(out.warn ?? null);
      }
    } catch (e: any) {
      console.log('OCR ERROR:', e);
      setError(`Could not read the meter: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  // Step 1: take the photo and freeze it.
  async function capture() {
    if (!cam.current || busy || !cameraReady) return;
    setBusy(true);
    setError(null);
    setReading(null);
    setRawText('');

    let photo: any;
    try {
      photo = await cam.current.takePictureAsync({ quality: 1, skipProcessing: false });
    } catch (e: any) {
      console.log('CAPTURE ERROR:', e);
      setError(`Capture failed: ${e?.message ?? 'unknown error'}`);
      setBusy(false);
      return;
    }
    if (!photo) {
      setError('The camera returned no photo. Please try again.');
      setBusy(false);
      return;
    }

    // Freeze the image immediately so the user sees the shot.
    const shot: Captured = {
      uri: photo.uri,
      width: photo.width ?? 0,
      height: photo.height ?? 0,
    };
    setCaptured(shot);

    // Step 2: read the kWh from the frozen image.
    await runRead(shot);
  }

  // Retry the read on the SAME photo (e.g. after "Gemini is busy").
  function readAgain() {
    if (captured && !busy) runRead(captured);
  }

  // Retake: drop the frozen image and go back to live camera.
  function retake() {
    setCaptured(null);
    setReading(null);
    setRawText('');
    setWarn(null);
    setError(null);
  }

  // Accept: hand off to Confirm screen.
  function accept() {
    if (reading == null) return;
    nav.replace('Confirm', { value: reading, raw: rawText });
  }

  // Frame geometry (fractions of the screen). Right side = whatever is left.
  const rightFrac = Math.max(0, 1 - CROP.x - CROP.w);
  const bottomFrac = Math.max(0, 1 - CROP.y - CROP.h);

  const needsRetry = !!captured && !busy && reading == null;

  return (
    <View className="flex-1 bg-black" onLayout={onLayout}>
      {/* --- Live camera OR frozen image --- */}
      {captured ? (
        <Image
          source={{ uri: captured.uri }}
          style={{ flex: 1 }}
          resizeMode="cover"
        />
      ) : (
        <CameraView
          ref={cam}
          style={{ flex: 1 }}
          facing="back"
          autofocus="on"
          onCameraReady={() => setCameraReady(true)}
          onMountError={(e) => setError(`Camera error: ${e.message}`)}
        />
      )}

      {/* --- Meter type toggle (live camera only) --- */}
      {!captured && (
        <View className="absolute top-14 left-0 right-0 items-center">
          <View className="flex-row bg-black/60 rounded-full p-1">
            {(['digital', 'analog'] as MeterMode[]).map((m) => (
              <Text
                key={m}
                onPress={() => setMode(m)}
                className={
                  'px-5 py-2 rounded-full text-sm font-semibold ' +
                  (mode === m ? 'bg-emerald-500 text-white' : 'text-white/70')
                }
              >
                {m === 'digital' ? 'Digital' : 'Analog'}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* --- Alignment frame (live camera) --- */}
      {!captured && (
        <View pointerEvents="none" className="absolute inset-0">
          <View style={{ height: `${CROP.y * 100}%` }} className="bg-black/55" />
          <View style={{ height: `${CROP.h * 100}%` }} className="flex-row">
            <View style={{ width: `${CROP.x * 100}%` }} className="bg-black/55" />
            <View className="flex-1 border-2 border-white rounded-lg" />
            <View style={{ width: `${rightFrac * 100}%` }} className="bg-black/55" />
          </View>
          <View
            style={{ height: `${bottomFrac * 100}%` }}
            className="bg-black/55 items-center pt-4 px-8"
          >
            <Text className="text-white text-center">
              {mode === 'digital'
                ? 'Fit the meter display (digits and "kWh") inside the frame. Avoid glare and hold steady.'
                : 'Get close so the row of dials fills the frame (not the whole meter). Avoid glare on the glass and hold steady.'}
            </Text>
          </View>
        </View>
      )}

      {/* --- Frozen-preview overlay: same frame on the captured photo --- */}
      {captured && (
        <View pointerEvents="none" className="absolute inset-0">
          <View style={{ height: `${CROP.y * 100}%` }} className="bg-black/60" />
          <View style={{ height: `${CROP.h * 100}%` }} className="flex-row">
            <View style={{ width: `${CROP.x * 100}%` }} className="bg-black/60" />
            <View className="flex-1 border-2 border-emerald-400 rounded-lg" />
            <View style={{ width: `${rightFrac * 100}%` }} className="bg-black/60" />
          </View>
          <View
            style={{ height: `${bottomFrac * 100}%` }}
            className="bg-black/60 items-center pt-4 px-8"
          >
            <Text className="text-white text-center text-sm">
              Captured photo. Reading the meter inside the box.
            </Text>
          </View>
        </View>
      )}

      {/* --- Big reading card on top of the frozen image --- */}
      {captured && !busy && reading != null && (
        <View className="absolute top-14 left-4 right-4 items-center">
          <View className="bg-emerald-500 w-full px-6 py-6 rounded-3xl items-center">
            <Text className="text-white text-base uppercase tracking-widest text-center mb-1">
              Reading
            </Text>
            <Text
              className="text-white font-extrabold text-center"
              style={{ fontSize: 56 }}
              adjustsFontSizeToFit
              numberOfLines={1}
              minimumFontScale={0.5}
            >
              {reading}
            </Text>
            <Text className="text-white text-xl font-semibold mt-1">kWh</Text>
            {warn ? (
              <Text className="text-yellow-100 text-center text-sm font-semibold mt-3">
                {warn}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* --- Bottom controls --- */}
      <View
        className="absolute bottom-0 left-0 right-0 p-5 bg-black/70"
        style={{ paddingBottom: 50 }}
      >
        <ErrorBanner message={error} />

        {captured ? (
          // Frozen image: Retake, then Use reading (or Read again after an error)
          <View className="flex-row">
            <View className="flex-1 mr-3">
              <Button label="Retake" variant="ghost" onPress={retake} />
            </View>
            <View className="flex-[2]">
              <Button
                label={needsRetry ? 'Read again' : 'Use reading'}
                onPress={needsRetry ? readAgain : accept}
                disabled={busy || (!needsRetry && reading == null)}
              />
            </View>
          </View>
        ) : (
          // Live camera: Cancel or Capture
          <View className="flex-row">
            <View className="flex-1 mr-3">
              <Button label="Cancel" variant="ghost" onPress={() => nav.goBack()} />
            </View>
            <View className="flex-[2]">
              <Button
                label={error ? 'Retake scan' : 'Capture reading'}
                onPress={capture}
                loading={busy}
                disabled={!cameraReady || busy}
              />
            </View>
          </View>
        )}

        {busy ? (
          <View className="items-center mt-3">
            <ActivityIndicator color="#fff" />
            <Text className="text-white text-xs mt-2">Reading the meter…</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
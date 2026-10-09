import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, LayoutChangeEvent, Pressable, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button, ErrorBanner } from '../components/ui';
import { Screen } from '../components/Background';
import { Txt } from '../components/Dark';
import { C } from '../lib/theme';
import { CROPS, MeterMode, readMeter } from '../lib/ocr';

type Captured = {
  uri: string;
  width: number;
  height: number;
};

const SHADE = 'rgba(0,0,0,0.58)';

export default function ScanScreen() {
  const nav = useNavigation<any>();
  const cam = useRef<CameraView>(null);
  const [perm, requestPerm] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Size of the screen area, needed to map the on-screen frame onto the photo.
  const [viewSize, setViewSize] = useState<{ viewW: number; viewH: number }>({ viewW: 0, viewH: 0 });

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

  if (!perm) return <View style={{ flex: 1, backgroundColor: C.base }} />;
  if (!perm.granted) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: C.panel,
              borderWidth: 1,
              borderColor: C.line,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <Ionicons name="camera-outline" size={30} color={C.volt} />
          </View>
          <Txt className="text-2xl font-extrabold text-center mb-2">Camera access needed</Txt>
          <Txt tone="muted" className="text-center mb-8 leading-6">
            Scan2Bill reads your meter from a photo. The cropped meter display is sent to an AI
            service to read the digits.
          </Txt>
          <View style={{ alignSelf: 'stretch' }}>
            <Button label="Allow camera" onPress={() => requestPerm()} />
          </View>
        </View>
      </Screen>
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

    const shot: Captured = { uri: photo.uri, width: photo.width ?? 0, height: photo.height ?? 0 };
    setCaptured(shot);

    // Step 2: read the kWh from the frozen image.
    await runRead(shot);
  }

  function readAgain() {
    if (captured && !busy) runRead(captured);
  }

  function retake() {
    setCaptured(null);
    setReading(null);
    setRawText('');
    setWarn(null);
    setError(null);
  }

  function accept() {
    if (reading == null) return;
    nav.replace('Confirm', { value: reading, raw: rawText });
  }

  const rightFrac = Math.max(0, 1 - CROP.x - CROP.w);
  const bottomFrac = Math.max(0, 1 - CROP.y - CROP.h);
  const needsRetry = !!captured && !busy && reading == null;

  // Dim overlay with a clear window; reused for live + frozen.
  const frame = (borderColor: string, caption: string, small?: boolean) => (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <View style={{ height: `${CROP.y * 100}%`, backgroundColor: SHADE }} />
      <View style={{ height: `${CROP.h * 100}%`, flexDirection: 'row' }}>
        <View style={{ width: `${CROP.x * 100}%`, backgroundColor: SHADE }} />
        <View
          style={{
            flex: 1,
            borderWidth: 2,
            borderColor,
            borderRadius: 14,
            shadowColor: borderColor,
            shadowOpacity: 0.6,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
        <View style={{ width: `${rightFrac * 100}%`, backgroundColor: SHADE }} />
      </View>
      <View
        style={{
          height: `${bottomFrac * 100}%`,
          backgroundColor: SHADE,
          alignItems: 'center',
          paddingTop: 16,
          paddingHorizontal: 32,
        }}
      >
        <Txt className={small ? 'text-center text-sm' : 'text-center'}>{caption}</Txt>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={onLayout}>
      {/* --- Live camera OR frozen image --- */}
      {captured ? (
        <Image source={{ uri: captured.uri }} style={{ flex: 1 }} resizeMode="cover" />
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
        <View style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center' }}>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: 'rgba(11,13,16,0.75)',
              borderRadius: 999,
              padding: 4,
              borderWidth: 1,
              borderColor: C.line,
            }}
          >
            {(['digital', 'analog'] as MeterMode[]).map((m) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={{
                    paddingHorizontal: 22,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? C.volt : 'transparent',
                  }}
                >
                  <Txt
                    className="text-sm font-semibold"
                    style={{ color: active ? C.onVolt : 'rgba(255,255,255,0.7)' }}
                  >
                    {m === 'digital' ? 'Digital' : 'Analog'}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* --- Alignment frame --- */}
      {!captured &&
        frame(
          '#FFFFFF',
          mode === 'digital'
            ? 'Fit the meter display (digits and "kWh") inside the frame. Avoid glare and hold steady.'
            : 'Get close so the row of dials fills the frame (not the whole meter). Avoid glare on the glass and hold steady.'
        )}
      {captured && frame(C.volt, 'Captured photo. Reading the meter inside the box.', true)}

      {/* --- Big reading card on top of the frozen image --- */}
      {captured && !busy && reading != null && (
        <View style={{ position: 'absolute', top: 56, left: 16, right: 16, alignItems: 'center' }}>
          <View
            style={{
              backgroundColor: C.volt,
              width: '100%',
              paddingHorizontal: 24,
              paddingVertical: 24,
              borderRadius: 28,
              alignItems: 'center',
              shadowColor: C.volt,
              shadowOpacity: 0.45,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 0 },
              elevation: 8,
            }}
          >
            <Txt className="text-base uppercase tracking-widest text-center mb-1" style={{ color: C.onVolt, opacity: 0.7 }}>
              Reading
            </Txt>
            <Txt
              className="font-extrabold text-center"
              style={{ fontSize: 56, color: C.onVolt }}
              adjustsFontSizeToFit
              numberOfLines={1}
              minimumFontScale={0.5}
            >
              {reading}
            </Txt>
            <Txt className="text-xl font-semibold mt-1" style={{ color: C.onVolt }}>kWh</Txt>
            {warn ? (
              <Txt className="text-center text-sm font-semibold mt-3" style={{ color: '#4A3A00' }}>
                {warn}
              </Txt>
            ) : null}
          </View>
        </View>
      )}

      {/* --- Bottom controls --- */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 20,
          paddingBottom: 50,
          backgroundColor: 'rgba(11,13,16,0.88)',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderTopWidth: 1,
          borderColor: C.line,
        }}
      >
        <ErrorBanner message={error} />

        {captured ? (
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
            <ActivityIndicator color={C.volt} />
            <Txt tone="muted" className="text-xs mt-2">Reading the meter…</Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
}
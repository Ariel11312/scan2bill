import React, { useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { Button, ErrorBanner } from '../components/ui';
import { CROP, readMeter } from '../lib/ocr';

export default function ScanScreen() {
  const nav = useNavigation<any>();
  const cam = useRef<CameraView>(null);
  const [perm, requestPerm] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!perm) return <View className="flex-1 bg-ink" />;
  if (!perm.granted) {
    return (
      <View className="flex-1 bg-paper justify-center px-6">
        <Text className="text-xl font-bold text-ink mb-2">Camera access needed</Text>
        <Text className="text-muted mb-6">MeterScan reads your meter from a photo. The image is processed on your phone.</Text>
        <Button label="Allow camera" onPress={() => requestPerm()} />
      </View>
    );
  }

  async function capture() {
    if (!cam.current || busy || !cameraReady) return;
    setBusy(true); setError(null);

    // Step 1: take the photo
    let photo;
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

    // Step 2: read the meter (OCR)
    try {
      const out = await readMeter(photo.uri, photo.width, photo.height);
      if (!out.ok) { setError(out.error); return; }
      nav.replace('Confirm', { value: out.value, raw: out.raw });
    } catch (e: any) {
      console.log('OCR ERROR:', e);
      setError(`Could not read the meter: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cam}
        style={{ flex: 1 }}
        facing="back"
        autofocus="on"
        onCameraReady={() => setCameraReady(true)}
        onMountError={(e) => setError(`Camera error: ${e.message}`)}
      />

      {/* Alignment frame; position must match CROP in lib/ocr.ts */}
      <View pointerEvents="none" className="absolute inset-0">
        <View style={{ height: `${CROP.y * 100}%` }} className="bg-black/55" />
        <View style={{ height: `${CROP.h * 100}%` }} className="flex-row">
          <View style={{ width: `${CROP.x * 100}%` }} className="bg-black/55" />
          <View className="flex-1 border-2 border-white rounded-lg" />
          <View style={{ width: `${CROP.x * 100}%` }} className="bg-black/55" />
        </View>
        <View className="flex-1 bg-black/55 items-center pt-4 px-8">
          <Text className="text-white text-center">Fit the meter digits inside the frame. Avoid glare and hold steady.</Text>
        </View>
      </View>

      <View className="absolute bottom-0 left-0 right-0 p-5 bg-black/70">
        <ErrorBanner message={error} />
        <View className="flex-row">
          <View className="flex-1 mr-3"><Button label="Cancel" variant="ghost" onPress={() => nav.goBack()} /></View>
          <View className="flex-[2]">
            <Button
              label={error ? 'Retake scan' : 'Capture reading'}
              onPress={capture}
              loading={busy}
              disabled={!cameraReady || busy}
            />
          </View>
        </View>
        {busy ? <View className="items-center mt-3"><ActivityIndicator color="#fff" /></View> : null}
      </View>
    </View>
  );
}
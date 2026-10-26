import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { averageSamples, similarity, type FaceEngine } from '../services/face/faceMath';
import { FaceProcessor } from './FaceProcessor';
import { colors } from '../theme/tokens';
import { Button } from './ui';

export function FaceCapture({ onSubmit, onCancel }: { onSubmit: (embedding: number[]) => Promise<void>; onCancel: () => void }) {
  const camera = useRef<CameraView>(null);
  const active = useRef(true);
  const lock = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [engine, setEngine] = useState<FaceEngine>();
  const [ready, setReady] = useState(false);
  const [samples, setSamples] = useState<number[][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modelError, setModelError] = useState('');
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const capture = async () => {
    if (!camera.current || !engine || !ready || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const temporary = new Set<string>();
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1, imageType: 'jpg', isImageMirror: false });
      if (!picture) throw new Error('Không chụp được ảnh từ camera.');
      temporary.add(picture.uri);
      const context = ImageManipulator.manipulate(picture.uri);
      if (Math.max(picture.width, picture.height) > 1280) context.resize(picture.width >= picture.height ? { width: 1280 } : { height: 1280 });
      const rendered = await context.renderAsync();
      const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
      temporary.add(image.uri);
      if (!image.base64) throw new Error('Không đọc được khung hình.');
      const vector = await engine.extract(image.base64);
      if (samples.length && similarity(samples[0], vector) < .5) throw new Error('Các lần quét không cùng một người. Giữ nguyên người trước camera.');
      if (active.current) setSamples(previous => [...previous, vector]);
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Không xử lý được khuôn mặt.'); }
    finally {
      if (Platform.OS !== 'web') await Promise.allSettled([...temporary].filter(uri => uri.startsWith('file://'))
        .map(uri => FileSystem.deleteAsync(uri, { idempotent: true })));
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const submit = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await onSubmit(averageSamples(samples)); }
    catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Không gửi được mẫu.'); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  };
  return <View style={s.stack}>
    <FaceProcessor onReady={setEngine} onError={setModelError} />
    <Text style={s.caption}>Nhìn thẳng, đủ sáng và chỉ để một người trong khung. Quét 3 lần; ảnh được xử lý trong app, chỉ đặc trưng khuôn mặt được gửi đi.</Text>
    {modelError ? <Text accessibilityRole="alert" style={s.error}>{modelError}</Text> : !engine ? <Text style={s.caption}>Đang tải model về thiết bị; lần đầu có thể mất một lúc...</Text> : null}
    {samples.length < 3 ? <>
      {permission?.granted ? <View style={s.preview}>
        <CameraView ref={camera} style={s.camera} facing="front" mirror={false} onCameraReady={() => setReady(true)}
          onMountError={() => { setReady(false); setError('Không mở được camera. Hãy kiểm tra quyền hoặc đóng ứng dụng đang sử dụng camera.'); }} />
        <View pointerEvents="none" style={s.guide}>
          <View style={s.faceOutline} />
          <Text style={s.guideText}>Căn trọn khuôn mặt trong khung</Text>
        </View>
      </View>
        : <Button title="Cho phép sử dụng camera" onPress={() => { void requestPermission().catch(() => setError('Không cấp được quyền camera.')); }} />}
      {permission && !permission.granted && !permission.canAskAgain ? <Text style={s.error}>Camera đang bị chặn. Hãy cấp quyền trong cài đặt ứng dụng hoặc trình duyệt.</Text> : null}
      <Button title={busy ? 'Đang xử lý trên thiết bị...' : `Quét mẫu ${samples.length + 1}/3`} disabled={busy || !ready || !engine || !!modelError} onPress={() => { void capture(); }} />
    </> : <><Text style={s.success}>Đã quét đủ 3 mẫu. Camera đã tắt; có thể gửi mẫu để chủ cửa duyệt.</Text>
      <Button title={busy ? 'Đang gửi đặc trưng...' : 'Gửi mẫu để duyệt'} disabled={busy} onPress={() => { void submit(); }} />
      <Button title="Quét lại" variant="ghost" disabled={busy} onPress={() => { setSamples([]); setReady(false); setError(''); }} />
    </>}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <Button title="Hủy quét" variant="ghost" disabled={busy} onPress={onCancel} />
  </View>;
}

const s = StyleSheet.create({
  stack: { gap: 12 },
  preview: { height: 320, width: '100%', position: 'relative', borderRadius: 16, overflow: 'hidden', backgroundColor: '#111827' },
  camera: { ...StyleSheet.absoluteFill },
  guide: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  faceOutline: { width: '54%', height: '76%', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 180 },
  guideText: { position: 'absolute', bottom: 12, color: '#fff', backgroundColor: 'rgba(15,23,42,0.72)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, fontSize: 13, fontWeight: '600' },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 20 }, error: { color: colors.error }, success: { color: colors.success },
});

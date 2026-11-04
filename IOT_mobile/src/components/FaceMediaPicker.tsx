import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from './ui';

export function FaceCapture({ onSubmit, onCancel }: {
  onSubmit: (asset: ImagePicker.ImagePickerAsset) => Promise<void>; onCancel: () => void;
}) {
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (camera: boolean) => {
    setError('');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        throw new Error('Cần quyền camera để chụp ảnh. Bạn cũng có thể chọn ảnh/video từ thư viện.');
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], cameraType: ImagePicker.CameraType.front, quality: .9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: .9 });
      if (!result.canceled) {
        const chosen = result.assets[0];
        if (chosen.type === 'video' && chosen.duration != null && chosen.duration > 10000) throw new Error('Chọn video tối đa 10 giây.');
        const limit = chosen.type === 'video' ? 20 : 5;
        if (chosen.fileSize != null && chosen.fileSize > limit * 1024 * 1024) throw new Error(`Tệp tối đa ${limit} MiB.`);
        setAsset(chosen);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Không chọn được tệp.'); }
  };
  return <View style={{ gap: 12 }}>
    <Text>Ảnh hoặc video được tải lên máy chủ để xử lý. App không tải model khuôn mặt. Máy chủ lưu đặc trưng, không giữ tệp gốc sau xử lý.</Text>
    <Text>Ảnh JPEG/PNG tối đa 5 MiB; video MP4/MOV/WebM tối đa 10 giây và 20 MiB. Cần đúng một người, rõ mặt và đủ ánh sáng.</Text>
    <Button title="Chọn ảnh hoặc video" disabled={busy} onPress={() => { void pick(false); }} />
    <Button title="Chụp ảnh khuôn mặt" disabled={busy} onPress={() => { void pick(true); }} />
    {asset ? <Text>Đã chọn {asset.type === 'video' ? 'video' : 'ảnh'}: {asset.fileName ?? 'Tệp từ thiết bị'}</Text> : null}
    <Button title={busy ? 'Đang tải lên và xử lý trên máy chủ…' : 'Đồng ý tải lên và lưu hồ sơ'} disabled={busy || !asset} onPress={() => {
      if (!asset || busy) return;
      setBusy(true); setError('');
      void onSubmit(asset).catch(e => setError(e instanceof Error ? e.message : 'Không xử lý được tệp.')).finally(() => setBusy(false));
    }} />
    {error ? <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error}</Text> : null}
    <Button title="Hủy" variant="ghost" disabled={busy} onPress={onCancel} />
  </View>;
}

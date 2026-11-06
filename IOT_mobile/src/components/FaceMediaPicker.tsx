import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Badge, Button, Notice, styles as s } from './ui';

export function FaceCapture({
  onSubmit,
  onCancel,
}: {
  onSubmit: (asset: ImagePicker.ImagePickerAsset) => Promise<void>;
  onCancel: () => void;
}) {
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (camera: boolean) => {
    setError('');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        throw new Error(
          'Cần quyền camera để chụp ảnh. Bạn cũng có thể chọn ảnh/video từ thư viện.',
        );
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            cameraType: ImagePicker.CameraType.front,
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.9,
          });
      if (!result.canceled) {
        const chosen = result.assets[0];
        if (chosen.type === 'video' && chosen.duration != null && chosen.duration > 10000)
          throw new Error('Chọn video tối đa 10 giây.');
        const limit = chosen.type === 'video' ? 20 : 5;
        if (chosen.fileSize != null && chosen.fileSize > limit * 1024 * 1024)
          throw new Error(`Tệp tối đa ${limit} MiB.`);
        setAsset(chosen);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không chọn được tệp.');
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <Notice>
        Chọn ảnh rõ mặt hoặc chụp ảnh mới. Tệp được tải lên để xử lý; máy chủ lưu đặc trưng và không
        giữ tệp gốc sau xử lý.
      </Notice>
      <Text style={s.description}>
        Ảnh JPEG/PNG tối đa 5 MiB; video MP4/MOV/WebM tối đa 10 giây và 20 MiB. Cần đúng một người,
        rõ mặt và đủ ánh sáng.
      </Text>
      <Button
        title="Chọn ảnh hoặc video"
        variant="ghost"
        icon="images-outline"
        disabled={busy}
        onPress={() => {
          void pick(false);
        }}
      />
      <Button
        title="Chụp ảnh khuôn mặt"
        variant="ghost"
        icon="camera-outline"
        disabled={busy}
        onPress={() => {
          void pick(true);
        }}
      />
      {asset ? (
        <View style={{ gap: 10 }}>
          {asset.type !== 'video' ? (
            <Image
              source={{ uri: asset.uri }}
              style={{ width: '100%', height: 190, borderRadius: 12 }}
              resizeMode="contain"
              accessibilityLabel="Ảnh khuôn mặt đã chọn"
            />
          ) : null}
          <Badge label={asset.type === 'video' ? 'Đã chọn video' : 'Đã chọn ảnh'} tone="primary" />
          <Text style={s.caption}>{asset.fileName ?? 'Tệp từ thiết bị'}</Text>
        </View>
      ) : null}
      <Button
        title={busy ? 'Đang xử lý hồ sơ…' : 'Đồng ý tải lên và lưu hồ sơ'}
        loading={busy}
        disabled={busy || !asset}
        onPress={() => {
          if (!asset || busy) return;
          setBusy(true);
          setError('');
          void onSubmit(asset)
            .catch((e) => setError(e instanceof Error ? e.message : 'Không xử lý được tệp.'))
            .finally(() => setBusy(false));
        }}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button title="Hủy" variant="ghost" disabled={busy} onPress={onCancel} />
    </View>
  );
}

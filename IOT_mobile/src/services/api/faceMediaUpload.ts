import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { request } from './client';
import type { FaceProfile } from './faceService';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { MAX_FACE_IMAGE_EDGE, prepareFaceMedia } from './faceMediaInput';

export async function uploadFaceMedia(source: ImagePickerAsset): Promise<FaceProfile> {
  const asset = await prepareFaceMedia(source, async uri => {
    const context = ImageManipulator.manipulate(uri, { maxWidth: MAX_FACE_IMAGE_EDGE, maxHeight: MAX_FACE_IMAGE_EDGE });
    let rendered = await context.renderAsync();
    if (Math.max(rendered.width, rendered.height) > MAX_FACE_IMAGE_EDGE) {
      const resized = ImageManipulator.manipulate(rendered);
      resized.resize(rendered.width >= rendered.height ? { width: MAX_FACE_IMAGE_EDGE } : { height: MAX_FACE_IMAGE_EDGE });
      rendered = await resized.renderAsync();
    }
    return rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  });
  const type = 'image/jpeg';
  const limit = 5 * 1024 * 1024;
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = asset.file ?? await (await fetch(asset.uri)).blob();
    if (blob.size > limit) throw new Error('Tệp vượt quá kích thước cho phép.');
    form.append('file', blob, 'face-enrollment.jpg');
  } else {
    form.append('file', { uri: asset.uri, type, name: 'face-enrollment.jpg' } as unknown as Blob);
  }
  form.append('consent', 'true');
  const uploadFetch: typeof fetch = Platform.OS === 'web' ? fetch : require('whatwg-fetch').fetch;
  return request<FaceProfile>('/api/faces/me/media', { method: 'POST', body: form }, uploadFetch, 90000);
}

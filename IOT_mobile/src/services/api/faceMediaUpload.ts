import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { request } from './client';
import type { FaceProfile } from './faceService';

export async function uploadFaceMedia(asset: ImagePickerAsset): Promise<FaceProfile> {
  const type = asset.mimeType ?? (/\.mp4(?:\?|$)/i.test(asset.uri) ? 'video/mp4'
    : /\.mov(?:\?|$)/i.test(asset.uri) ? 'video/quicktime'
    : /\.webm(?:\?|$)/i.test(asset.uri) ? 'video/webm'
    : /\.png(?:\?|$)/i.test(asset.uri) ? 'image/png' : 'image/jpeg');
  if (!['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'video/webm'].includes(type)) throw new Error('Chọn JPEG/PNG hoặc MP4/MOV/WebM.');
  const limit = (type.startsWith('video/') ? 20 : 5) * 1024 * 1024;
  if (asset.fileSize != null && asset.fileSize > limit) throw new Error('Ảnh tối đa 5 MiB, video tối đa 20 MiB.');
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = asset.file ?? await (await fetch(asset.uri)).blob();
    if (blob.size > limit) throw new Error('Tệp vượt quá kích thước cho phép.');
    form.append('file', blob, 'face-media');
  } else {
    form.append('file', { uri: asset.uri, type, name: 'face-media' } as unknown as Blob);
  }
  form.append('consent', 'true');
  const uploadFetch: typeof fetch = Platform.OS === 'web' ? fetch : require('whatwg-fetch').fetch;
  return request<FaceProfile>('/api/faces/me/media', { method: 'POST', body: form }, uploadFetch, 90000);
}

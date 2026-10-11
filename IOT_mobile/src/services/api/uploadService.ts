import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { request } from './client';
export interface ImageUploadResponse { id: string; url: string; contentType: string; size: number; faceRequestId: number | null; }
export function validateImage(asset: ImagePickerAsset) {
  if (asset.fileSize !== undefined && asset.fileSize > 5 * 1024 * 1024) throw new Error('Ảnh phải nhỏ hơn hoặc bằng 5 MiB.');
  if (asset.width * asset.height > 20_000_000) throw new Error('Ảnh phải nhỏ hơn hoặc bằng 20 megapixel.');
  const type = asset.mimeType ?? (/\.png(?:\?|$)/i.test(asset.uri) ? 'image/png' : /\.jpe?g(?:\?|$)/i.test(asset.uri) ? 'image/jpeg' : undefined);
  if (type !== 'image/jpeg' && type !== 'image/png') throw new Error('Chỉ hỗ trợ JPEG/PNG. Vui lòng chụp ảnh mới hoặc chọn ảnh JPEG/PNG.');
  return type;
}
export const uploadService = {
  async upload(asset: ImagePickerAsset, faceRequestId?: number) {
    const type = validateImage(asset);
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob: Blob = asset.file ?? (await (await fetch(asset.uri)).blob());
      if (blob.size > 5 * 1024 * 1024) throw new Error('Ảnh phải nhỏ hơn hoặc bằng 5 MiB.');
      form.append('file', blob, type === 'image/png' ? 'image.png' : 'image.jpg');
    } else {
      // React Native supports a URI part; the DOM FormData declaration only describes Blob.
      const part = { uri: asset.uri, type, name: type === 'image/png' ? 'image.png' : 'image.jpg' };
      form.append('file', part as unknown as Blob);
    }
    if (faceRequestId !== undefined) form.append('faceRequestId', String(faceRequestId));
    // Do not set Content-Type: fetch supplies the multipart boundary.
    // SDK 57 replaces global fetch with expo/fetch, which rejects RN URI parts.
    // Use the same XHR-backed polyfill as React Native, only for native uploads.
    const uploadFetch: typeof fetch = Platform.OS === 'web'
      ? fetch
      : require('whatwg-fetch').fetch;
    return request<ImageUploadResponse>('/api/images', { method: 'POST', body: form }, uploadFetch);
  },
};

import type { ImagePickerAsset } from 'expo-image-picker';

export const MAX_SOURCE_MEDIA_BYTES = 20 * 1024 * 1024;
export const MAX_FACE_IMAGE_EDGE = 1600;
type NormalizedImage = { uri: string; width: number; height: number };

export async function prepareFaceMedia(
  asset: ImagePickerAsset,
  normalizeImage: (uri: string) => Promise<NormalizedImage>,
): Promise<ImagePickerAsset> {
  const type = asset.mimeType?.toLowerCase() ?? (/\.mp4(?:\?|$)/i.test(asset.uri) ? 'video/mp4'
    : /\.mov(?:\?|$)/i.test(asset.uri) ? 'video/quicktime'
    : /\.webm(?:\?|$)/i.test(asset.uri) ? 'video/webm' : 'image/jpeg');
  if (asset.fileSize != null && asset.fileSize > MAX_SOURCE_MEDIA_BYTES)
    throw new Error('Chọn ảnh/video tối đa 20 MiB.');
  if (asset.type === 'video' || type.startsWith('video/')) {
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(type)) throw new Error('Chọn video MP4/MOV/WebM.');
    if (asset.duration != null && asset.duration > 10000) throw new Error('Chọn video tối đa 10 giây.');
    return { ...asset, type: 'video', mimeType: type };
  }
  if (!['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'].includes(type))
    throw new Error('Chọn ảnh JPEG/PNG/HEIC hoặc chụp ảnh mới.');
  let image: NormalizedImage;
  try { image = await normalizeImage(asset.uri); }
  catch { throw new Error('Không mở được ảnh đã chọn. Chọn ảnh JPEG/PNG khác hoặc chụp ảnh mới.'); }
  if (!image.uri || !Number.isFinite(image.width) || !Number.isFinite(image.height)
      || Math.min(image.width, image.height) <= 0 || Math.max(image.width, image.height) > MAX_FACE_IMAGE_EDGE)
    throw new Error('Chưa tối ưu được kích thước ảnh. Chọn ảnh khác hoặc chụp lại.');
  // Discard the original web File, EXIF and MIME so multipart sends the normalized pixels.
  return { ...asset, ...image, type: 'image', mimeType: 'image/jpeg', fileName: 'face-enrollment.jpg',
    fileSize: undefined, file: undefined, exif: undefined, base64: undefined };
}

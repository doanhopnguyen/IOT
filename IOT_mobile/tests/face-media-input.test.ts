import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ImagePickerAsset } from 'expo-image-picker';
import { MAX_SOURCE_MEDIA_BYTES, prepareFaceMedia } from '../src/services/api/faceMediaInput';

const photo: ImagePickerAsset = { uri: 'file:///library/photo.heic', width: 8000, height: 6000,
  type: 'image', mimeType: 'image/heic', fileSize: 8 * 1024 * 1024, exif: { Orientation: 6 } };

test('library photos send normalized JPEG pixels instead of original high-resolution file and EXIF', async () => {
  const original = { ...photo, file: { name: 'original.heic' } as File };
  const prepared = await prepareFaceMedia(original, async uri => {
    assert.equal(uri, original.uri);
    return { uri: 'file:///cache/normalized.jpg', width: 1200, height: 1600 };
  });
  assert.equal(prepared.uri, 'file:///cache/normalized.jpg');
  assert.equal(prepared.mimeType, 'image/jpeg');
  assert.equal(prepared.fileName, 'face-enrollment.jpg');
  assert.equal(prepared.width, 1200);
  assert.equal(prepared.height, 1600);
  assert.equal(prepared.file, undefined);
  assert.equal(prepared.exif, undefined);
  assert.equal(prepared.fileSize, undefined);
  assert.equal(original.mimeType, 'image/heic');
});

test('video enrollment is rejected before decoding or upload', async () => {
  for (const asset of [
    { ...photo, type: 'video' as const, mimeType: 'video/mp4' },
    { ...photo, type: 'image' as const, mimeType: 'video/quicktime' },
    { ...photo, uri: 'file:///clip.mp4', mimeType: undefined },
  ]) {
    await assert.rejects(prepareFaceMedia(asset, async () => {
      assert.fail('must not decode video');
    }), /Chỉ chọn ảnh/);
  }
});

test('failed image decoding never falls back to uploading the original file', async () => {
  await assert.rejects(prepareFaceMedia(photo, async () => { throw new Error('decoder failed'); }), /Không mở được ảnh/);
  await assert.rejects(prepareFaceMedia(photo, async () => ({ uri: 'file:///large.jpg', width: 8000, height: 6000 })), /kích thước/);
  await assert.rejects(prepareFaceMedia(photo, async () => ({ uri: '', width: 0, height: 0 })), /kích thước/);
});

test('oversized sources and unsupported files fail before image decoding', async () => {
  let calls = 0;
  const decode = async () => { calls++; return { uri: 'file:///normalized.jpg', width: 512, height: 512 }; };
  await assert.rejects(prepareFaceMedia({ ...photo, fileSize: MAX_SOURCE_MEDIA_BYTES + 1 }, decode), /20 MiB/);
  await assert.rejects(prepareFaceMedia({ ...photo, mimeType: 'application/pdf' }, decode), /Chọn ảnh/);
  assert.equal(calls, 0);
});

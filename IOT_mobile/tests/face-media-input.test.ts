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

test('videos preserve original bytes and are never passed to the image decoder', async () => {
  const video: ImagePickerAsset = { uri: 'file:///clip.mp4', width: 1920, height: 1080,
    type: 'video', mimeType: 'video/mp4', duration: 5000, fileSize: 1000 };
  const prepared = await prepareFaceMedia(video, async () => { throw new Error('must not decode video'); });
  assert.equal(prepared.uri, video.uri);
  assert.equal(prepared.mimeType, 'video/mp4');
  assert.equal(prepared.fileSize, video.fileSize);
  await assert.rejects(prepareFaceMedia({ ...video, duration: 10001 }, async () => photo), /10 giây/);
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

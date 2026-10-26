import type { Pixels } from './faceMath';

export function readPixels(base64: string): Promise<Pixels> {
  return new Promise((resolve, reject) => {
    if (typeof base64 !== 'string' || base64.length > 8_000_000) return reject(new Error('Khung hình quá lớn.'));
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 4_000_000) return reject(new Error('Kích thước khung hình không hợp lệ.'));
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return reject(new Error('Không đọc được khung hình trên thiết bị.'));
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ data: pixels.data, width: pixels.width, height: pixels.height });
      canvas.width = 0; canvas.height = 0;
    };
    image.onerror = () => reject(new Error('Không giải mã được khung hình camera.'));
    // Chỉ nhận ảnh đang nằm trong bộ nhớ; không tải ảnh người dùng từ URL.
    image.src = /^data:image\/(jpeg|png);base64,/.test(base64) ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

// Tiền xử lý SCRFD / ArcFace giống node camera Python.
export const FACE_MODEL = 'buffalo_l/w600k_r50:v1';
export type Pixels = { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
export type Point = [number, number];
export type Detection = { box: number[]; landmarks: Point[]; score: number };
export type Inference = (values: Float32Array, dims: number[]) => Promise<Float32Array[]>;
export type FaceSessions = { detect: Inference; recognize: Inference };
export type FaceEngine = { extract: (jpegBase64: string) => Promise<number[]> };

export function normalize(values: ArrayLike<number>): number[] {
  if (values.length !== 512) throw new Error('Mẫu khuôn mặt phải có 512 đặc trưng.');
  let squared = 0;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) throw new Error('Mẫu khuôn mặt không hợp lệ.');
    squared += values[i] ** 2;
  }
  if (squared < 1e-12 || !Number.isFinite(squared)) throw new Error('Không lấy được đặc trưng khuôn mặt.');
  return Array.from(values, value => value / Math.sqrt(squared));
}

export const similarity = (left: number[], right: number[]) => left.reduce((sum, value, i) => sum + value * right[i], 0);

function sample(image: Pixels, x: number, y: number, channel: number, border = false): number {
  if (!border) { x = Math.max(0, Math.min(image.width - 1, x)); y = Math.max(0, Math.min(image.height - 1, y)); }
  const x0 = Math.floor(x), y0 = Math.floor(y), dx = x - x0, dy = y - y0;
  const pixel = (px: number, py: number) => px < 0 || py < 0 || px >= image.width || py >= image.height ? 0 : image.data[(py * image.width + px) * 4 + channel];
  return pixel(x0, y0) * (1 - dx) * (1 - dy) + pixel(x0 + 1, y0) * dx * (1 - dy)
    + pixel(x0, y0 + 1) * (1 - dx) * dy + pixel(x0 + 1, y0 + 1) * dx * dy;
}

export function detectorInput(image: Pixels) {
  const scale = 640 / Math.max(image.width, image.height);
  const width = Math.floor(image.width * scale), height = Math.floor(image.height * scale);
  const tensor = new Float32Array(3 * 640 * 640).fill(-127.5 / 128);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    tensor[c * 640 * 640 + y * 640 + x] = (sample(image, (x + .5) * image.width / width - .5, (y + .5) * image.height / height - .5, c) - 127.5) / 128;
  }
  return { tensor, scale: height / image.height };
}

const overlap = (a: number[], b: number[]) => {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + 1)
    * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + 1);
  return intersection / ((a[2] - a[0] + 1) * (a[3] - a[1] + 1) + (b[2] - b[0] + 1) * (b[3] - b[1] + 1) - intersection);
};

export function detections(outputs: Float32Array[], scale: number): Detection[] {
  if (outputs.length !== 9) throw new Error('Model phát hiện khuôn mặt không tương thích.');
  const candidates: Detection[] = [];
  [8, 16, 32].forEach((stride, level) => {
    const scores = outputs[level], boxes = outputs[level + 3], landmarks = outputs[level + 6];
    const width = 640 / stride;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] < .7) continue;
      const anchor = Math.floor(i / 2), x = (anchor % width) * stride, y = Math.floor(anchor / width) * stride;
      candidates.push({ score: scores[i],
        box: [(x - boxes[i * 4] * stride) / scale, (y - boxes[i * 4 + 1] * stride) / scale,
          (x + boxes[i * 4 + 2] * stride) / scale, (y + boxes[i * 4 + 3] * stride) / scale],
        landmarks: Array.from({ length: 5 }, (_, j) => [(x + landmarks[i * 10 + j * 2] * stride) / scale,
          (y + landmarks[i * 10 + j * 2 + 1] * stride) / scale] as Point),
      });
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const item of candidates) if (kept.every(other => overlap(item.box, other.box) <= .4)) kept.push(item);
  return kept;
}

const target: Point[] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

export function alignment(landmarks: Point[]) {
  const mean = (points: Point[], axis: number) => points.reduce((sum, point) => sum + point[axis], 0) / 5;
  const sx = mean(landmarks, 0), sy = mean(landmarks, 1), tx = mean(target, 0), ty = mean(target, 1);
  let dot = 0, cross = 0, norm = 0;
  landmarks.forEach(([x, y], i) => {
    x -= sx; y -= sy;
    const u = target[i][0] - tx, v = target[i][1] - ty;
    dot += x * u + y * v; cross += x * v - y * u; norm += x * x + y * y;
  });
  if (norm < 1e-6) throw new Error('Không căn chỉnh được khuôn mặt.');
  const a = dot / norm, b = cross / norm;
  return { a, b, tx: tx - a * sx + b * sy, ty: ty - b * sx - a * sy };
}

export function alignedInput(image: Pixels, face: Detection): Float32Array {
  const { a, b, tx, ty } = alignment(face.landmarks), norm = a * a + b * b;
  if (norm < 1e-9) throw new Error('Hãy nhìn thẳng vào camera.');
  const tensor = new Float32Array(3 * 112 * 112);
  for (let y = 0; y < 112; y++) for (let x = 0; x < 112; x++) for (let c = 0; c < 3; c++) {
    const sx = (a * (x - tx) + b * (y - ty)) / norm, sy = (-b * (x - tx) + a * (y - ty)) / norm;
    tensor[c * 112 * 112 + y * 112 + x] = (sample(image, sx, sy, c, true) - 127.5) / 127.5;
  }
  return tensor;
}

export function checkQuality(image: Pixels, face: Detection) {
  const [x1, y1, x2, y2] = face.box.map(Math.floor);
  if (x1 < 0 || y1 < 0 || x2 > image.width || y2 > image.height) throw new Error('Đưa toàn bộ khuôn mặt vào khung.');
  if (Math.min(x2 - x1, y2 - y1) < 80) throw new Error('Hãy đưa mặt gần camera hơn.');
  const gray = (x: number, y: number) => sample(image, x, y, 0) * .299 + sample(image, x, y, 1) * .587 + sample(image, x, y, 2) * .114;
  let sum = 0, squared = 0, count = 0;
  for (let y = y1 + 1; y < y2 - 1; y++) for (let x = x1 + 1; x < x2 - 1; x++) {
    const laplace = gray(x - 1, y) + gray(x + 1, y) + gray(x, y - 1) + gray(x, y + 1) - 4 * gray(x, y);
    sum += laplace; squared += laplace * laplace; count++;
  }
  if (!count || squared / count - (sum / count) ** 2 < 40) throw new Error('Ảnh bị mờ; giữ máy yên và tăng ánh sáng.');
}

export async function extractEmbedding(image: Pixels, sessions: FaceSessions): Promise<number[]> {
  const input = detectorInput(image);
  const faces = detections(await sessions.detect(input.tensor, [1, 3, 640, 640]), input.scale);
  if (faces.length !== 1) throw new Error(faces.length ? 'Chỉ để một người trong khung hình.' : 'Chưa tìm thấy khuôn mặt; hãy nhìn thẳng vào camera.');
  checkQuality(image, faces[0]);
  return normalize((await sessions.recognize(alignedInput(image, faces[0]), [1, 3, 112, 112]))[0]);
}

export function averageSamples(samples: number[][]) {
  if (samples.length !== 3) throw new Error('Cần quét đủ 3 mẫu khuôn mặt.');
  if (samples.slice(1).some(sample => similarity(samples[0], sample) < .5)) throw new Error('Các lần quét không cùng một người. Hãy quét lại.');
  return normalize(samples[0].map((_, i) => samples.reduce((sum, sample) => sum + sample[i], 0) / samples.length));
}

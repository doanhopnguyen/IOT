// Sao chép model đã tải và ghim phiên bản; script không tải model hoặc ảnh.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = path.resolve(app, '../face-node');
const destination = path.join(app, 'public/face-models');
const manifest = JSON.parse(await readFile(path.join(node, 'model-checksums.json'), 'utf8'));
await mkdir(destination, { recursive: true });
for (const name of ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await copyFile(path.join(app, 'node_modules/onnxruntime-web/dist', name), path.join(destination, name));
}
for (const name of ['det_10g.onnx', 'w600k_r50.onnx']) {
  const relative = `models/buffalo_l/${name}`;
  const source = path.join(node, 'models', relative);
  let bytes;
  try { bytes = await readFile(source); }
  catch { console.warn(`Thiếu ${name}: chạy face-node/node.py --download-models --accept-model-license trước khi quét khuôn mặt.`); continue; }
  if (createHash('sha256').update(bytes).digest('hex') !== manifest[relative]) throw new Error(`Mã kiểm tra model không khớp: ${name}`);
  await copyFile(source, path.join(destination, name));
}
console.log('Đã chuẩn bị model khuôn mặt cục bộ trong public/face-models.');

// WebView trên điện thoại dùng cùng các hàm xử lý cục bộ; ảnh truyền qua postMessage
// trong ứng dụng và chỉ vector đặc trưng được trả về, không có API tải ảnh.
for (const [source, output] of [['faceMath.ts', 'faceMath.js'], ['imagePixels.ts', 'imagePixels.js'], ['runtime.web.ts', 'runtime.web.js'], ['captureRuntime.ts', 'captureRuntime.js']]) {
  const text = await readFile(path.join(app, 'src/services/face', source), 'utf8');
  const compiled = ts.transpileModule(text, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020}});
  await writeFile(path.join(destination, output), compiled.outputText);
}
await writeFile(path.join(destination, 'capture-runtime.html'), `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src data:; connect-src 'self'"><title>Local face processor</title></head><body><script type="module" src="captureRuntime.js"></script></body></html>`);

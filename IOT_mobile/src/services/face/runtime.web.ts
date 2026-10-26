import type { FaceSessions, Inference } from './faceMath';
type Ort = typeof import('onnxruntime-web');
let pending: Promise<FaceSessions> | undefined;

export function loadFaceSessions(baseUrl?: string): Promise<FaceSessions> {
  if (!pending) pending = load(baseUrl).catch(error => { pending = undefined; throw error; });
  return pending;
}

async function load(baseUrl?: string): Promise<FaceSessions> {
  // WASM và model được lưu tại máy chủ ứng dụng; ảnh camera không gửi đến dịch vụ nào.
  const base = baseUrl ?? new URL('/face-models/', window.location.origin).href;
  const context = window as unknown as { ort?: Ort };
  if (!context.ort) await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = base + 'ort.wasm.min.js';
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new Error('Chưa có model cục bộ. Chạy npm run prepare:face-models trong IOT_mobile.')); };
    document.head.appendChild(script);
  });
  const ort = context.ort;
  if (!ort) throw new Error('Không khởi tạo được ONNX trên trình duyệt.');
  ort.env.wasm.wasmPaths = base;
  ort.env.wasm.numThreads = 1;
  const create = async (name: string): Promise<Inference> => {
    const session = await ort.InferenceSession.create(base + name, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return async (values, dims) => {
      const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', values, dims) });
      return session.outputNames.map(key => output[key].data as Float32Array);
    };
  };
  return { detect: await create('det_10g.onnx'), recognize: await create('w600k_r50.onnx') };
}

// Trang này chạy trong WebView của điện thoại. postMessage chỉ truyền dữ liệu nội bộ trong app.
// Chỉ các tệp model công khai được tải từ máy chủ web; ảnh camera không được tải lên.
import { extractEmbedding } from './faceMath.js';
import { readPixels } from './imagePixels.js';
import { loadFaceSessions } from './runtime.web.js';

const bridge = window as unknown as { ReactNativeWebView?: { postMessage: (value: string) => void } };
const send = (value: unknown) => bridge.ReactNativeWebView?.postMessage(JSON.stringify(value));
const sessions = loadFaceSessions(new URL('.', window.location.href).href);
void sessions.then(() => send({ type: 'READY' })).catch(() => send({ type: 'ERROR', error: 'Không tải được model nhận diện trên thiết bị.' }));
const running = new Set<number>();
const receive = async (event: MessageEvent) => {
  let id: number | undefined;
  try {
    const body = JSON.parse(event.data);
    if (body.type !== 'EXTRACT' || !Number.isSafeInteger(body.id) || body.id <= 0 || running.has(body.id)) return;
    id = body.id;
    running.add(body.id);
    const embedding = await extractEmbedding(await readPixels(body.image), await sessions);
    send({ type: 'RESULT', id, embedding });
  } catch (error) {
    send({ type: 'ERROR', id, error: error instanceof Error ? error.message : 'Không xử lý được khuôn mặt.' });
  } finally { if (id !== undefined) running.delete(id); }
};
window.addEventListener('message', event => { void receive(event); });
document.addEventListener('message', event => { void receive(event as MessageEvent); });

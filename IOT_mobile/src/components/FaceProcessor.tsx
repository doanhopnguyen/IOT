import Constants from 'expo-constants';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { normalize, type FaceEngine } from '../services/face/faceMath';

export function FaceProcessor({ onReady, onError }: { onReady: (engine: FaceEngine) => void; onError: (message: string) => void }) {
  const view = useRef<WebView>(null);
  const sequence = useRef(0);
  const pending = useRef(new Map<number, { resolve: (values: number[]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const host = Constants.expoConfig?.hostUri;
  const configured = process.env.EXPO_PUBLIC_FACE_MODEL_BASE_URL;
  const base = configured?.replace(/\/$/, '') ?? (host ? `http://${host}/face-models` : undefined);
  const source = base ? `${base}/capture-runtime.html` : undefined;
  useEffect(() => {
    const jobs = pending.current;
    if (!source) onError('Chưa cấu hình địa chỉ tải model cho app.');
    return () => {
      for (const job of jobs.values()) { clearTimeout(job.timer); job.reject(new Error('Đã hủy quét khuôn mặt.')); }
      jobs.clear();
    };
  }, [source, onError]);
  if (!source) return null;
  const extract = (image: string): Promise<number[]> => new Promise((resolve, reject) => {
    const id = ++sequence.current;
    const timer = setTimeout(() => { pending.current.delete(id); reject(new Error('Xử lý quá lâu. Hãy thử lại trên thiết bị.')); }, 90000);
    pending.current.set(id, { resolve, reject, timer });
    view.current?.postMessage(JSON.stringify({ type: 'EXTRACT', id, image }));
  });
  return <View pointerEvents="none" style={{ width: 1, height: 1, opacity: 0, overflow: 'hidden' }}>
    <WebView ref={view} source={{ uri: source }} style={{ width: 1, height: 1 }} javaScriptEnabled
      originWhitelist={[new URL(source).origin]}
      onShouldStartLoadWithRequest={request => request.url === source || request.url === 'about:blank'}
      onError={() => onError('Không mở được model nhận diện. Kiểm tra kết nối tới máy chạy ứng dụng web.')}
      onContentProcessDidTerminate={() => onError('Thiết bị đã dừng xử lý model. Hãy hủy và thử lại.')}
      onMessage={event => {
        try {
          const body = JSON.parse(event.nativeEvent.data);
          if (body.type === 'READY') { onReady({ extract }); return; }
          const job = pending.current.get(body.id);
          if (!job) { if (body.type === 'ERROR' && body.id === undefined) onError(String(body.error)); return; }
          clearTimeout(job.timer); pending.current.delete(body.id);
          if (body.type === 'RESULT' && Array.isArray(body.embedding)) {
            try { job.resolve(normalize(body.embedding)); } catch { job.reject(new Error('Đặc trưng khuôn mặt không hợp lệ.')); }
          } else job.reject(new Error(String(body.error ?? 'Không xử lý được khuôn mặt.')));
        } catch { onError('Phản hồi nhận diện không hợp lệ.'); }
      }} />
  </View>;
}

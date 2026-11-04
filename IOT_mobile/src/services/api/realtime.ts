import { apiUrl, onServerChange } from './client';

// Session cookie authenticates the handshake; REST continues to enforce per-door permissions.
export function subscribeUpdates(refresh: () => void): () => void {
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const connect = () => {
    if (stopped) return;
    try {
      socket = new WebSocket(apiUrl('/ws/updates').replace(/^http/, 'ws'));
      socket.onmessage = event => {
        try { if (JSON.parse(String(event.data)).type === 'refresh') refresh(); } catch { /* Ignore malformed frames. */ }
      };
      socket.onclose = () => { if (!stopped) timer = setTimeout(connect, 5000); };
      socket.onerror = () => socket?.close();
    } catch { if (!stopped) timer = setTimeout(connect, 5000); }
  };
  connect();
  const stop = () => { stopped = true; if (timer) clearTimeout(timer); socket?.close(); };
  const unsubscribe = onServerChange(stop);
  return () => { stop(); unsubscribe(); };
}

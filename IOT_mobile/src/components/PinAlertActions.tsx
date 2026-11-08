import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { isPinAlertActionable, respondToPinAlert, type AlertDto, type PinAlertAction } from '../services/api/alertService';
import { Button, Notice, styles as s } from './ui';

export function PinAlertActions({ alert, onResolved }: { alert: AlertDto; onResolved: () => void }) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const respond = async (action: PinAlertAction) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      await respondToPinAlert(alert.id, action);
      setDone(action === 'SAFE' ? 'Đã tắt chuông. Bàn phím được phép nhập PIN trở lại.' : 'Đã tắt chuông và tạm khóa cửa. PIN và quyền mở của thành viên bị chặn; chủ cửa vẫn dùng quyền mở đang có.');
      onResolved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không gửi được lựa chọn tới cửa.'); }
    finally { running.current = false; setBusy(false); }
  };
  if (!isPinAlertActionable(alert) && !done) return null;
  return <View style={{ gap: 8, marginTop: 4 }}>
    {done ? <Notice tone="info">{done}</Notice> : <>
      <Text style={s.caption}>Chọn cách xử lý sau khi kiểm tra cửa. Cả hai lựa chọn đều tắt chuông của cảnh báo hiện tại.</Text>
      <Button title="Cửa vẫn an toàn" variant="ghost" icon="shield-checkmark-outline" disabled={busy} onPress={() => { void respond('SAFE'); }} />
      <Button title="Tạm thời khóa cửa" icon="lock-closed-outline" disabled={busy} onPress={() => { void respond('LOCKDOWN'); }} />
      {busy ? <Text style={s.caption}>Đang chờ cửa xác nhận…</Text> : null}
    </>}
    {error ? <Notice tone="error">{error}</Notice> : null}
  </View>;
}

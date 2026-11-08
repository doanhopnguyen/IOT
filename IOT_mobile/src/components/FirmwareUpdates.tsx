import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { firmwareService, firmwareUpdateState, type FirmwareStatus, type FirmwareRelease } from '../services/api/firmwareService';
import { useConfirm } from './ConfirmationProvider';
import { Badge, Button, Card, LoadingState, Notice, styles as s } from './ui';
import { colors } from '../theme/tokens';

export function FirmwareUpdates({ unitId }: { unitId: number }) {
  const confirm = useConfirm();
  const [status, setStatus] = useState<FirmwareStatus>();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true, running = false;
    const poll = async () => {
      if (running) return; running = true;
      try { const next = await firmwareService.status(unitId); if (active) { setStatus(next); setError(''); } }
      catch (e) { if (active) setError(e instanceof Error ? e.message : 'Chưa kiểm tra được bản cập nhật.'); }
      finally { running = false; }
    };
    void poll(); const timer = setInterval(() => { void poll(); }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [unitId]);
  const install = async (release: FirmwareRelease) => {
    const agreed = await confirm({ title: `Cài đặt ${release.label}?`, message: 'Cửa sẽ tạm dừng điều khiển rồi khởi động lại. Đóng và khóa cửa, giữ nguồn điện và Wi-Fi trong lúc cập nhật. PIN, thẻ, vân tay và cấu hình của bạn được giữ nguyên.', confirmLabel: 'Đồng ý cập nhật' });
    if (!agreed) return;
    setBusy(true); setError('');
    try {
      const command = await firmwareService.install(unitId, release.id);
      setStatus(current => current ? { ...current, update: command, targetVersion: release.version } : current);
    } catch (e) { setError(e instanceof Error ? e.message : 'Chưa gửi được yêu cầu cập nhật.'); }
    finally { setBusy(false); }
  };
  const state = status ? firmwareUpdateState(status) : 'IDLE';
  const waiting = state === 'UPDATING' || state === 'RECONNECTING';
  const failure = status?.update?.resultMessage;
  const messages: Record<string, string> = {
    OTA_CLOSE_AND_LOCK_DOOR: 'Đóng cửa và chờ chốt khóa xong rồi thử lại.',
    OTA_DOWNLOAD_FAILED: 'Cửa chưa tải được firmware. Kiểm tra Wi-Fi và địa chỉ tải trên máy chủ.',
    OTA_DOWNLOAD_INTERRUPTED: 'Tải firmware bị gián đoạn. Bản đang chạy được giữ để bạn thử lại.',
    OTA_SHA256_MISMATCH: 'Tệp tải về không khớp kiểm tra toàn vẹn. Cửa đã hủy bản cập nhật.',
    OTA_BOOT_VERSION_NOT_CONFIRMED: 'Chưa xác nhận được phiên bản sau khi khởi động lại.',
    OTA_BOOT_VERSION_MISMATCH: 'Phiên bản khởi động không khớp với bản phát hành.',
  };
  return <View style={{ gap: 18 }}>
    <Card>
      <View style={s.row}>
        <View style={{ width: 48, height: 48, borderRadius: 18, backgroundColor: colors.indigoSoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="cloud-download-outline" size={24} color={colors.indigo} /></View>
        <View style={{ flex: 1, gap: 4 }}><Text style={s.heading}>Phần mềm của cửa</Text><Text style={s.caption}>Phiên bản hiện tại: {status?.currentVersion ?? 'Đang kiểm tra…'}</Text></View>
        {status ? <Badge label={status.online ? 'Online' : 'Offline'} tone={status.online ? 'success' : 'neutral'} /> : null}
      </View>
      <Text style={s.description}>Nhận bản phát hành từ hệ thống. Bạn quyết định thời điểm cài đặt trên cửa của mình.</Text>
    </Card>
    {!status && !error ? <LoadingState label="Đang kiểm tra bản cập nhật…" /> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
    {waiting ? <Notice tone="info">{state === 'RECONNECTING' ? 'Thiết bị đã xác nhận cập nhật. Đang chờ cửa kết nối lại với phiên bản mới…' : `Đang cập nhật lên ${status?.targetVersion}. Giữ nguồn điện và Wi-Fi; cửa sẽ tự khởi động lại. App tự cập nhật kết quả.`}</Notice> : null}
    {state === 'COMPLETE' ? <Notice tone="success">Cửa đã khởi động lại và xác nhận phiên bản {status?.currentVersion}. Cập nhật thành công.</Notice> : null}
    {state === 'FAILED' ? <Notice tone="warning">{(failure && messages[failure]) || 'Cửa chưa xác nhận cập nhật thành công. Kiểm tra kết nối và thử lại.'}</Notice> : null}
    {status && !status.capable ? <Notice tone="warning">Cửa cần bản cơ sở có OTA từ 1.13.0 để nhận cập nhật từ xa. Liên hệ người cấp phát thiết bị để nâng bản cơ sở.</Notice> : null}
    {status?.available.map(release => <Card key={release.id}>
      <View style={s.row}><View style={{ flex: 1 }}><Text style={s.heading}>{release.label}</Text><Text style={s.caption}>{release.version} · {(release.size / 1024 / 1024).toFixed(2)} MiB</Text></View><Badge label="Bản mới" tone="primary" /></View>
      <Text style={s.description}>{release.notes || 'Cải thiện phần mềm của cửa.'}</Text>
      <Text style={s.caption}>Phát hành {new Date(release.publishedAt).toLocaleDateString('vi-VN')}</Text>
      <Button title={waiting ? 'Đang cập nhật…' : `Cập nhật ${release.label}`} icon="cloud-download-outline" disabled={busy || waiting || !status.online || !status.capable} onPress={() => { void install(release); }} />
    </Card>)}
    {status && !status.available.length && !waiting && state !== 'COMPLETE' ? <Card><Text style={s.heading}>Chưa có bản cập nhật mới</Text><Text style={s.description}>App sẽ hiển thị tại đây khi hệ thống phát hành bản phù hợp với cửa.</Text></Card> : null}
  </View>;
}

export function FirmwareUpdateNotice({ unitId, onOpen }: { unitId: number; onOpen: () => void }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const check = async () => { try { const s = await firmwareService.status(unitId); if (active) setCount(s.available.length); } catch { /* Door controls remain available while release checks retry. */ } };
    void check(); const timer = setInterval(() => { void check(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [unitId]);
  return count ? <Card><View style={s.row}><Ionicons name="cloud-download-outline" size={25} color={colors.indigo} /><View style={{ flex: 1 }}><Text style={s.heading}>Có bản cập nhật cho cửa</Text><Text style={s.caption}>Xem nội dung và chọn thời điểm cài đặt.</Text></View><Badge label={String(count)} tone="primary" /></View><Button title="Xem bản cập nhật" variant="ghost" onPress={onOpen} /></Card> : null;
}

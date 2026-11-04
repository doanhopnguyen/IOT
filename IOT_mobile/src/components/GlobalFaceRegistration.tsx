import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Button, Card } from './ui';
import { FaceCapture } from './FaceCapture';
import { uploadFaceMedia } from '../services/api/faceMediaUpload';
import { faceService, faceRequestLabel, type FaceProfile, type FaceRequestDto } from '../services/api/faceService';
import type { Door } from '../models/domain';

export function GlobalFaceRegistration({ doors, back }: { doors: Door[]; back: () => void }) {
  const [profile, setProfile] = useState<FaceProfile>();
  const [requests, setRequests] = useState<FaceRequestDto[]>([]);
  const [capture, setCapture] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = async () => {
    const [p, r] = await Promise.all([faceService.profile(), faceService.list()]); setProfile(p); setRequests(r);
  };
  useEffect(() => { void reload().catch(e => setError(e.message)); }, []);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thực hiện được.'); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 16, paddingBottom: 100 }}>
    <Pressable onPress={back}><Text>← Quay lại</Text></Pressable>
    <Text style={{ fontSize: 27, fontWeight: '700' }}>Khuôn mặt của tôi</Text>
    <Text>Đăng ký ảnh một lần cho tài khoản. Chủ cửa duyệt riêng từng yêu cầu; chỉ sử dụng khi hệ thống online.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error}</Text> : null}
    <Card><Text>{profile?.hasTemplate ? 'Đã có hồ sơ dùng chung. Không cần tải lại khi xin thêm cửa.' : 'Chưa có hồ sơ khuôn mặt.'}</Text>
      {capture ? <FaceCapture onCancel={() => setCapture(false)} onSubmit={async asset => { await uploadFaceMedia(asset); setCapture(false); await reload(); }} /> : <Button title={profile?.hasTemplate ? 'Thay ảnh/video — các cửa cần duyệt lại' : 'Đăng ký bằng ảnh / video / camera'} onPress={() => setCapture(true)} />}
      {profile?.hasTemplate ? <Button title="Xóa hồ sơ trên toàn tài khoản" variant="danger" disabled={busy} onPress={() => { void act(() => faceService.revoke()); }} /> : null}
    </Card>
    <Text style={{ fontSize: 19, fontWeight: '600' }}>Xin phép sử dụng tại cửa</Text>
    {doors.map(d => {
      const rows = requests.filter(r => r.unitId === Number(d.id));
      const pending = rows.find(r => r.status === 'PENDING');
      return <Card key={d.id}><Text style={{ fontWeight: '700', marginBottom: 10 }}>{d.name}</Text>
        {rows.slice(0, 3).map(r => <Text key={r.id}>{faceRequestLabel(r)}</Text>)}
        <Button title={pending ? 'Hủy yêu cầu đang chờ' : 'Gửi yêu cầu dùng hồ sơ đã đăng ký'} disabled={busy || !profile?.hasTemplate} onPress={() => { void act(() => pending ? faceService.cancel(pending.id) : faceService.requestAccess(Number(d.id))); }} />
      </Card>;
    })}
    {!doors.length ? <Text>Bạn vẫn có thể đăng ký ảnh trước. Khi được mời vào cửa, quay lại đây để gửi yêu cầu.</Text> : null}
  </ScrollView>;
}

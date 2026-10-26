import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { Door } from '../models/domain';
import { faceRequestLabel, faceService, type FaceProfile, type FaceRequestDto } from '../services/api/faceService';
import { managerService } from '../services/api/managerService';
import { colors } from '../theme/tokens';
import { Button, Card } from './ui';
import { FaceCapture } from './FaceCapture';
import { FACE_MODEL } from '../services/face/faceMath';

const message = (error: unknown) => error instanceof Error ? error.message : 'Không kết nối được hệ thống.';
const emptyProfile: FaceProfile = { hasTemplate: false, credentialId: null, model: null };
const unfinished = (requests: FaceRequestDto[]) => requests.some(item => item.status === 'PENDING' || item.status === 'APPROVED');

function PendingNotice() {
  return <Card><Text style={s.caption}>Đã có yêu cầu chưa hoàn tất. Chờ chủ cửa duyệt hoặc hủy yêu cầu bên dưới trước khi quét mẫu mới.</Text></Card>;
}

function useFaceData(unitId?: number, accountId?: number) {
  const [profile, setProfile] = useState<FaceProfile>(emptyProfile);
  const [requests, setRequests] = useState<FaceRequestDto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const [nextProfile, nextRequests] = await Promise.all([
      accountId !== undefined && unitId !== undefined ? faceService.memberProfile(unitId, accountId) : faceService.profile(),
      faceService.list(accountId === undefined ? undefined : unitId),
    ]);
    return { nextProfile, nextRequests: accountId === undefined ? nextRequests : nextRequests.filter(item => item.accountId === accountId) };
  }, [unitId, accountId]);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setRevision(value => value + 1); }, []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await reload();
        if (active) { setProfile(data.nextProfile); setRequests(data.nextRequests); setError(''); }
      } catch (e) { if (active) setError(message(e)); }
      finally {
        if (active) { setLoading(false); timer = setTimeout(() => { void poll(); }, 5000); }
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [reload, revision]);
  return { profile, requests, error, loading, refresh };
}

function Back({ onPress }: { onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityLabel="Quay lại" style={s.back}><Ionicons name="arrow-back-outline" size={23} color={colors.primary} /></Pressable>;
}

function EnrollmentForm({ unitId, accountId, name, hasTemplate, onChanged }: {
  unitId: number; accountId?: number; name?: string; hasTemplate: boolean; onChanged: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [replace, setReplace] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const submit = async (embedding: number[]) => {
    if (!consent) throw new Error('Cần đồng ý thu thập khuôn mặt trước khi gửi.');
    const created = await faceService.create({ unitId, accountId, consent: true, model: FACE_MODEL, embedding });
    setCaptureOpen(false); setConsent(false); setReplace(false);
    setNotice(`Đã gửi mẫu cho yêu cầu #${created.id}. Mẫu có hiệu lực sau khi chủ cửa duyệt; máy chủ chỉ lưu đặc trưng khuôn mặt.`);
    onChanged();
  };
  return <Card style={s.stack}>
    <Text style={s.heading}>{accountId ? `Mẫu khuôn mặt của ${name}` : 'Mẫu khuôn mặt của bạn'}</Text>
    <Text style={s.caption}>Đăng ký một lần theo tài khoản. Camera chỉ nhận mẫu khi người này có quyền tại cửa tương ứng.</Text>
    {hasTemplate ? <><Text style={s.success}>Đã có mẫu; không cần đăng ký lại tại cửa khác.</Text>{accountId !== undefined ? <Text style={s.caption}>Chỉ thành viên được yêu cầu thay mẫu của mình. Chủ cửa quản lý quyền tại cửa này.</Text> : <View style={s.row}><Switch disabled={captureOpen} value={replace} onValueChange={setReplace} /><Text style={[s.caption, s.flex]}>Yêu cầu thay mẫu toàn tài khoản. Mẫu cũ vẫn có hiệu lực cho tới khi mẫu mới được duyệt.</Text></View>}</> : null}
    {(!hasTemplate || replace) ? <>
      <Text style={s.caption}>Quét bằng camera trong app. Model chạy trên thiết bị của bạn, không gửi hoặc lưu ảnh trên máy chủ.</Text>
      <View style={s.row}><Switch accessibilityLabel="Đồng ý thu thập khuôn mặt" disabled={captureOpen} value={consent} onValueChange={setConsent} /><Text style={[s.caption, s.flex]}>{accountId ? `Tôi xác nhận ${name} đồng ý đăng ký mẫu khuôn mặt và đồng bộ đến các cửa được cấp quyền.` : 'Tôi đồng ý đăng ký đặc trưng khuôn mặt và đồng bộ đến camera của các cửa được cấp quyền.'}</Text></View>
      {captureOpen ? <FaceCapture onSubmit={submit} onCancel={() => setCaptureOpen(false)} /> : <Button title={hasTemplate ? 'Quét để thay mẫu' : 'Quét khuôn mặt trong app'} disabled={!consent} onPress={() => { setNotice(''); setCaptureOpen(true); }} />}
    </> : null}
    {notice ? <Text style={s.success}>{notice}</Text> : null}
  </Card>;
}

function RequestCard({ item, manager, onChanged }: { item: FaceRequestDto; manager: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); onChanged(); } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  };
  return <Card style={s.stack}>
    <Text style={s.heading}>{item.accountName} · Yêu cầu #{item.id}</Text>
    <Text style={s.caption}>{item.unitName} · {new Date(item.requestedAt).toLocaleString('vi-VN')}</Text>
    <Text style={{ color: item.status === 'REJECTED' ? colors.error : colors.primary }}>{faceRequestLabel(item)}</Text>
    {manager && item.status === 'PENDING' ? <View style={s.row}><View style={s.flex}><Button title="Từ chối" variant="ghost" disabled={busy} onPress={() => { void act(() => faceService.decide(item.id, false)); }} /></View><View style={s.flex}><Button title="Duyệt" disabled={busy} onPress={() => { void act(() => faceService.decide(item.id, true)); }} /></View></View> : null}
    {(item.status === 'PENDING' || item.status === 'APPROVED') ? <Button title="Hủy yêu cầu" variant="ghost" disabled={busy} onPress={() => { void act(() => faceService.cancel(item.id)); }} /> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </Card>;
}

export function FaceRegistration({ doors, initialDoorName, back }: { doors: Door[]; initialDoorName?: string; back: () => void }) {
  const [doorId, setDoorId] = useState(() => doors.find(door => door.name === initialDoorName)?.id ?? doors[0]?.id ?? '');
  const { profile, requests, error, loading, refresh } = useFaceData();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  const revoke = async () => {
    setBusy(true); setRevokeError('');
    try { await faceService.revoke(); setConfirmRevoke(false); refresh(); }
    catch (e) { setRevokeError(message(e)); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={s.page}><Back onPress={back} /><Text style={s.title}>Thiết lập khuôn mặt</Text>
    <Text style={s.caption}>Mẫu dùng chung cho tài khoản; quyền ra vào được kiểm tra riêng tại từng cửa.</Text>
    {loading ? <Text style={s.caption}>Đang tải trạng thái mẫu...</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {profile.hasTemplate ? <Card style={s.stack}><Text style={s.success}>Mẫu khuôn mặt đang hoạt động</Text><Text style={s.caption}>Được thêm vào cửa mới không cần chụp lại. Chủ cửa phải bật quyền khuôn mặt trước khi camera nhận mẫu.</Text>
      {!confirmRevoke ? <Button title="Thu hồi mẫu toàn tài khoản" variant="ghost" onPress={() => setConfirmRevoke(true)} /> : <><Text style={s.error}>Mọi cửa sẽ ngừng chấp nhận mẫu này. Bạn có thể đăng ký mẫu mới sau đó.</Text><Button title={busy ? 'Đang thu hồi...' : 'Xác nhận thu hồi mẫu'} variant="danger" disabled={busy} onPress={() => { void revoke(); }} /><Button title="Hủy" variant="ghost" disabled={busy} onPress={() => setConfirmRevoke(false)} /></>}
      {revokeError ? <Text style={s.error}>{revokeError}</Text> : null}
    </Card> : null}
    {doors.length ? <><Text style={s.heading}>Chọn chủ cửa tiếp nhận yêu cầu</Text>{doors.map(door => <Pressable key={door.id} onPress={() => setDoorId(door.id)}><Card style={[s.row, door.id === doorId && s.selected]}><Text style={[s.heading, s.flex]}>{door.name}</Text><Ionicons name={door.id === doorId ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={colors.primary} /></Card></Pressable>)}
      {!loading && !error ? unfinished(requests) ? <PendingNotice /> : <EnrollmentForm key={doorId} unitId={Number(doorId)} hasTemplate={profile.hasTemplate} onChanged={refresh} /> : null}
    </> : <Card><Text style={s.caption}>Bạn cần thuộc một cửa để gửi yêu cầu đăng ký. Mẫu đã có vẫn được quản lý theo tài khoản.</Text></Card>}
    <Text style={s.heading}>Yêu cầu đã gửi</Text>{requests.length ? requests.map(item => <RequestCard key={item.id} item={item} manager={false} onChanged={refresh} />) : <Card><Text style={s.caption}>Chưa có yêu cầu đăng ký.</Text></Card>}
  </ScrollView>;
}

export function FaceApprovals({ door, back }: { door: Door; back: () => void }) {
  const [requests, setRequests] = useState<FaceRequestDto[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const data = await faceService.list(Number(door.id)); if (active) { setRequests(data); setError(''); } }
      catch (e) { if (active) setError(message(e)); }
      finally { if (active) timer = setTimeout(() => { void poll(); }, 5000); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [door.id, revision]);
  return <ScrollView contentContainerStyle={s.page}><Back onPress={back} /><Text style={s.title}>Duyệt đăng ký khuôn mặt</Text><Text style={s.caption}>{door.name} · Người dùng đã quét trong app. Duyệt để kích hoạt mẫu và cấp quyền khuôn mặt tại cửa này; camera sẽ tự đồng bộ đặc trưng.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {requests.length ? requests.map(item => <RequestCard key={item.id} item={item} manager onChanged={refresh} />) : <Card><Text style={s.caption}>Chưa có yêu cầu khuôn mặt.</Text></Card>}
  </ScrollView>;
}

export function MemberFacePanel({ unitId, accountId, name, allowed, onChanged }: {
  unitId: number; accountId: number; name: string; allowed: boolean; onChanged: () => Promise<void>;
}) {
  const { profile, requests, error, loading, refresh } = useFaceData(unitId, accountId);
  const [enabled, setEnabled] = useState(allowed);
  const [saving, setSaving] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  useEffect(() => setEnabled(allowed), [allowed]);
  const toggle = async (value: boolean) => {
    setSaving(true); setPermissionError('');
    try { await managerService.setFaceAccess(unitId, accountId, value); setEnabled(value); await onChanged(); refresh(); }
    catch (e) { setPermissionError(message(e)); }
    finally { setSaving(false); }
  };
  return <View style={s.stack}>
    <Card style={s.stack}><View style={s.row}><View style={s.flex}><Text style={s.heading}>Cho phép khuôn mặt tại cửa này</Text><Text style={s.caption}>Thay đổi quyền này không thay đổi quyền RFID, vân tay hoặc mở từ xa.</Text></View><Switch accessibilityLabel="Cho phép khuôn mặt" disabled={saving} value={enabled} onValueChange={value => { void toggle(value); }} /></View>
      {loading ? <Text style={s.caption}>Đang tải trạng thái mẫu...</Text> : <Text style={profile.hasTemplate ? s.success : s.caption}>{profile.hasTemplate ? 'Đã có mẫu dùng chung. Camera của cửa này sẽ nhận mẫu khi được cấp quyền.' : 'Chưa có mẫu khuôn mặt đang hoạt động.'}</Text>}
      {error || permissionError ? <Text accessibilityRole="alert" style={s.error}>{permissionError || error}</Text> : null}
    </Card>
    {!loading && !error ? unfinished(requests) ? <PendingNotice /> : <EnrollmentForm key={`${unitId}-${accountId}`} unitId={unitId} accountId={accountId} name={name} hasTemplate={profile.hasTemplate} onChanged={refresh} /> : null}
    {requests.map(item => <RequestCard key={item.id} item={item} manager onChanged={refresh} />)}
  </View>;
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 16, paddingBottom: 120 }, stack: { gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, flex: { flex: 1 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' }, heading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 19 }, error: { color: colors.error, lineHeight: 20 }, success: { color: colors.success, lineHeight: 20 },
  back: { width: 42, height: 42, justifyContent: 'center' }, selected: { borderWidth: 1, borderColor: colors.primary },
});

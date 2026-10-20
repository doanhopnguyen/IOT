import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { AppModal, Button, Card, Input, Screen, Status } from '../src/components/ui';
import { FloatingNav, TabKey } from '../src/components/FloatingNav';
import { Door, Person, VerificationRequest } from '../src/models/domain';
// Mock chỉ còn dùng cho duyệt ảnh khuôn mặt (chưa có API backend).
import { smartDoorService } from '../src/services/mockSmartDoorService';
import { uploadService, validateImage } from '../src/services/api/uploadService';
import { AccountDto, authService } from '../src/services/api/authService';
import { CommandDto, managerService, UserSearchDto } from '../src/services/api/managerService';
import { toDoor, unitService } from '../src/services/api/unitService';
import { ApiError } from '../src/services/api/client';
import { useNotificationBanner } from '../src/components/EventNotificationProvider';
import { AccessHistory } from '../src/components/AccessHistory';
import { Alerts } from '../src/components/Alerts';
import { colors } from '../src/theme/tokens';
import { canManageDoor, canRemoteUnlock } from '../src/utils/permissions';

type ViewName = TabKey | 'detail' | 'members' | 'member-detail' | 'add-member' | 'invite-member' |'user-verification' | 'approvals' | 'history' | 'alerts';
const icon = (name: keyof typeof Ionicons.glyphMap, color: string = colors.primary) => <Ionicons name={name} size={23} color={color} />;
// Door.id chính là unit_id của backend.
const backendUnitId = (door?: Door | null) => door && /^[1-9]\d*$/.test(door.id) ? Number(door.id) : null;
const errorText = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;
const commandMessage = (command: CommandDto, success: string) => command.status === 'ACKNOWLEDGED' ? success : command.status === 'TIMEOUT' ? 'Thiết bị không phản hồi kịp.' : command.resultMessage ?? 'Thiết bị báo thất bại.';

export default function SmartDoorApp() {
  const [booting, setBooting] = useState(true); const [account, setAccount] = useState<AccountDto | null>(null); const authenticated = account !== null; const [registering, setRegistering] = useState(false);
  const { setEnabled, openAlerts } = useNotificationBanner();
  const [view, setView] = useState<ViewName>('home'); const [doors, setDoors] = useState<Door[]>([]); const [members, setMembers] = useState<Person[]>([]);
  const [addOpen, setAddOpen] = useState(false); const [pinDoor, setPinDoor] = useState<Door | null>(null); const [selected, setSelected] = useState<Door | null>(null); const [selectedPerson, setSelectedPerson] = useState<Person | null>(null); const [verificationDoorName, setVerificationDoorName] = useState<string | undefined>();
  useEffect(() => {
    setEnabled(authenticated);
    return () => setEnabled(false);
  }, [authenticated, setEnabled]);
  useEffect(() => {
    openAlerts.current = () => {
      setAddOpen(false);
      setPinDoor(null);
      setView('alerts');
    };
    return () => {
      openAlerts.current = undefined;
    };
  }, [openAlerts]);
  const loadMembers = async (door: Door | null) => {
    const unitId = backendUnitId(door);
    if (!unitId) { setMembers([]); return; }
    try {
      const users = await managerService.listUnitUsers(unitId);
      setMembers(users.map(u => ({
        id: String(u.userId), name: u.displayName, hasAccount: true,
        methods: [u.allowFingerprint && 'Vân tay', u.allowRfid && 'RFID', u.allowRemoteUnlock && 'Mở từ xa'].filter((m): m is string => !!m),
        access: u.accountStatus === 'ACTIVE' && (u.allowFingerprint || u.allowRfid || u.allowRemoteUnlock) ? 'ACTIVE' : 'SUSPENDED', sync: 'SYNCED',
      })));
    } catch (e) { Alert.alert('Không tải được thành viên', errorText(e, 'Lỗi kết nối backend.')); }
  };
  const load = async (silent = false) => {
    try {
      const next = (await unitService.listMine()).map(toDoor);
      setDoors(next);
      // Màn chi tiết đang mở cũng nhận trạng thái mới (trực tuyến/ngoại tuyến)
      setSelected(current => current ? next.find(d => d.id === current.id) ?? current : current);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { authService.logout(); setAccount(null); return; }
      if (!silent) Alert.alert('Không tải được danh sách cửa', errorText(e, 'Lỗi kết nối backend.'));
    }
  };
  const sharedDoors = doors.filter(d => d.role === 'USER');
  // Khôi phục phiên từ cookie khi mở/tải lại app, tránh phải đăng nhập lại
  useEffect(() => { void authService.me().then(setAccount).catch(() => undefined).finally(() => setBooting(false)); }, []);
  useEffect(() => { if (authenticated) void load(); }, [authenticated]);
  // Tự cập nhật trạng thái cửa mỗi 10 giây, không cần tải lại trang
  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(() => { void load(true); }, 10000);
    return () => clearInterval(timer);
  }, [authenticated]);
  if (booting) return <Splash />;
  if (!account) return <Auth registering={registering} setRegistering={setRegistering} onDone={setAccount} />;
  const openDoor = (door: Door) => { setSelected(door); setView('detail'); };
  const body = view === 'home' ? <Home name={account.fullName} notifications={() => setView('alerts')} doors={doors} onDoor={openDoor} onUnlock={setPinDoor} /> : view === 'devices' ? <Devices doors={doors} onDoor={openDoor} onAdd={() => setAddOpen(true)} /> : view === 'invitations' ? <Invitations doors={sharedDoors} onOpen={openDoor} onLeave={async door => { await unitService.leave(Number(door.id)); await load(); }} /> : view === 'profile' ? <Profile account={account} notifications={() => setView('alerts')} logout={() => { authService.logout(); setAccount(null); setView('home'); }} verify={() => setView('user-verification')} /> : view === 'detail' && selected ? <Detail door={selected} back={() => setView('home')} unlock={() => setPinDoor(selected)} members={() => { void loadMembers(selected); setView('members'); }} approvals={() => setView('approvals')} setupFace={() => { setVerificationDoorName(selected.name); setView('user-verification'); }} history={() => setView('history')} /> : view === 'members' && selected ? <Members people={members} unitId={backendUnitId(selected)} refresh={() => loadMembers(selected)} back={() => setView('detail')} add={() => setView('add-member')} select={person => { setSelectedPerson(person); setView('member-detail'); }} /> : view === 'add-member' ? <AddMemberChoice back={() => setView('members')} chooseApp={() => setView('invite-member')} choosePerson={() => Alert.alert('Người chưa có ứng dụng', 'Người này cần tự đăng ký tài khoản trên ứng dụng trước, sau đó bạn tìm theo email để thêm vào cửa.')} /> : view === 'invite-member' ? <ExistingAppMember unitId={backendUnitId(selected)} back={() => setView('add-member')} done={async () => { await Promise.all([load(), loadMembers(selected)]); setView('members'); }} /> : view === 'user-verification' ? <UserVerification doors={doors.filter(d => d.role === 'USER')} initialDoorName={verificationDoorName} back={() => { setVerificationDoorName(undefined); setView('profile'); }} /> : view === 'approvals' && selected ? <Approvals door={selected} back={() => setView('detail')} /> : view === 'member-detail' && selectedPerson ? <MemberDetail person={selectedPerson} unitId={backendUnitId(selected)} refresh={async () => { await Promise.all([load(), loadMembers(selected)]); }} back={() => setView('members')} /> : view === 'alerts' ? <Alerts back={() => setView('home')} /> : <AccessHistory doorId={selected?.id} back={() => setView('detail')} />;
  return <Screen>{body}{(['home', 'devices', 'invitations', 'profile'] as ViewName[]).includes(view) && <FloatingNav active={view as TabKey} onTab={t => setView(t)} onAdd={() => setAddOpen(true)} />}<AddDevice open={addOpen} close={() => setAddOpen(false)} onCreated={load} /><PinModal door={pinDoor} close={() => setPinDoor(null)} /></Screen>;
}
function Splash() { return <Screen><View style={x.splash}>{icon('lock-closed', '#fff')}<Text style={x.logo}>Smart Door</Text><Text style={x.slogan}>An toàn trong từng lần mở cửa</Text></View></Screen>; }
function Auth({ registering, setRegistering, onDone }: { registering: boolean; setRegistering: (v: boolean) => void; onDone: (account: AccountDto) => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [show, setShow] = useState(false); const [saving, setSaving] = useState(false);
  const validate = () => {
    if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
    if (!registering) return email.trim() ? null : 'Vui lòng nhập email hoặc số điện thoại.';
    if (name.trim().length < 2) return 'Vui lòng nhập họ và tên.';
    if (!email.trim() && !phone.trim()) return 'Cần nhập email hoặc số điện thoại.';
    if (email.trim() && !email.includes('@')) return 'Email không hợp lệ.';
    if (phone.trim() && !/^\+?[0-9]{8,15}$/.test(phone.trim())) return 'Số điện thoại gồm 8–15 chữ số.';
    if (password !== confirm) return 'Mật khẩu xác nhận không khớp.';
    return null;
  };
  const submit = async () => {
    const invalid = validate();
    if (invalid) return Alert.alert('Thông tin chưa hợp lệ', invalid);
    setSaving(true);
    try {
      if (registering) await authService.register({ fullName: name, email, phone, password });
      // Backend không tự đăng nhập sau khi đăng ký
      onDone(await authService.login(registering ? (email.trim() || phone.trim()) : email, password));
    } catch (e) {
      Alert.alert(registering ? 'Đăng ký thất bại' : 'Đăng nhập thất bại', e instanceof Error ? e.message : 'Không kết nối được backend.');
    } finally { setSaving(false); }
  };
  return <Screen><ScrollView contentContainerStyle={x.auth}><View style={x.brand}>{icon('shield-checkmark', '#fff')}<Text style={x.brandText}>Smart Door</Text></View><Text style={x.title}>{registering ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</Text><Text style={x.sub}>{registering ? 'Bắt đầu quản lý không gian an toàn của bạn.' : 'Đăng nhập để quản lý cửa thông minh.'}</Text>{registering && <Input value={name} onChangeText={setName} placeholder="Họ và tên" />}<Input value={email} onChangeText={setEmail} placeholder={registering ? 'Email' : 'Email hoặc số điện thoại'} keyboardType="email-address" />{registering && <Input value={phone} onChangeText={setPhone} placeholder="Số điện thoại (không bắt buộc)" />}<View><Input value={password} onChangeText={setPassword} placeholder="Mật khẩu (ít nhất 8 ký tự)" secureTextEntry={!show} /><Pressable onPress={() => setShow(!show)} style={x.eye}>{icon(show ? 'eye-off-outline' : 'eye-outline', colors.muted)}</Pressable></View>{registering && <Input value={confirm} onChangeText={setConfirm} placeholder="Xác nhận mật khẩu" secureTextEntry={!show} />}<Button title={saving ? 'Đang xử lý...' : registering ? 'Đăng ký' : 'Đăng nhập'} disabled={saving} onPress={() => { void submit(); }} /><Pressable onPress={() => Alert.alert('Khôi phục mật khẩu', 'Chức năng sẽ gửi hướng dẫn qua email khi tích hợp backend.')}><Text style={x.link}>Quên mật khẩu?</Text></Pressable><Text style={x.switchText}>{registering ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}<Text onPress={() => setRegistering(!registering)} style={x.link}>{registering ? 'Đăng nhập' : 'Đăng ký'}</Text></Text></ScrollView></Screen>; }
function Home({ name, doors, onDoor, onUnlock, notifications }: { name: string; notifications: () => void; doors: Door[]; onDoor: (d: Door) => void; onUnlock: (d: Door) => void }) { const online = doors.filter(d => d.connectivity === 'ONLINE').length; const pad = (n: number) => String(n).padStart(2, '0'); return <ScrollView contentContainerStyle={x.page}><View style={x.row}><View style={{ flex: 1 }}><Text style={x.greeting}>Xin chào, {name}</Text><Text style={x.sub}>Chúc bạn một ngày an toàn</Text></View><Pressable onPress={notifications} accessibilityLabel="Xem cảnh báo">{icon('notifications-outline', colors.text)}</Pressable></View><Card style={x.summary}><Text style={x.summaryLabel}>Thiết bị của bạn</Text><Text style={x.big}>{pad(doors.length)} cửa</Text><Text style={x.online}>● {pad(online)} thiết bị trực tuyến</Text></Card><Text style={x.section}>Cửa của bạn</Text>{doors.length ? doors.map(d => <DoorCard key={d.id} door={d} onPress={() => onDoor(d)} onUnlock={() => onUnlock(d)} />) : <Empty title="Bạn chưa có cửa nào" />}<View style={{ height: 100 }} /></ScrollView>; }
function DoorCard({ door, onPress, onUnlock }: { door: Door; onPress: () => void; onUnlock: () => void }) { const usable = canRemoteUnlock(door); return <Card style={x.door}><Pressable onPress={onPress}><View style={x.row}><View style={x.doorIcon}>{icon(door.lockState === 'LOCKED' ? 'lock-closed-outline' : 'lock-open-outline')}</View><View style={{ flex: 1 }}><Text style={x.cardTitle}>{door.name}</Text><Text style={x.sub}>Đang {door.lockState === 'LOCKED' ? 'khóa' : 'mở'} · {door.role === 'OWNER' ? 'Chủ cửa' : 'Được chia sẻ'}</Text></View><Status online={door.connectivity === 'ONLINE'} /></View></Pressable>{usable ? <View style={{ marginTop: 14 }}><Button title="Mở cửa" icon="lock-open-outline" onPress={onUnlock} /></View> : <Text style={x.offline}>{door.connectivity === 'OFFLINE' ? 'Thiết bị ngoại tuyến' : 'Bạn chưa được cấp quyền mở từ xa'}</Text>}</Card>; }
function Devices({ doors, onDoor, onAdd }: { doors: Door[]; onDoor: (d: Door) => void; onAdd: () => void }) { const owned = doors.filter(canManageDoor); return <ScrollView contentContainerStyle={x.page}><Text style={x.title}>Quản lý thiết bị</Text><Input value="" onChangeText={() => {}} placeholder="Tìm kiếm thiết bị" />{owned.length ? owned.map(d => <Card key={d.id} style={x.device}><View style={x.row}><View><Text style={x.cardTitle}>{d.name}</Text><Text style={x.sub}>{d.members} thành viên · {d.lastUpdate}</Text></View><Status online={d.connectivity === 'ONLINE'} /></View><View style={{ marginTop: 14 }}><Button title="Quản lý" variant="ghost" onPress={() => onDoor(d)} /></View></Card>) : <Empty title="Bạn chưa có thiết bị nào" action={onAdd} />}<View style={{ height: 100 }} /></ScrollView>; }
function Detail({ door, back, unlock, members, approvals, setupFace, history }: { door: Door; back: () => void; unlock: () => void; members: () => void; approvals: () => void; setupFace: () => void; history: () => void }) { const owner = canManageDoor(door); return <ScrollView contentContainerStyle={x.page}><Back onPress={back} /><Text style={x.title}>{door.name}</Text><Card style={x.hero}><View style={x.largeLock}>{icon(door.lockState === 'LOCKED' ? 'lock-closed' : 'lock-open', '#fff')}</View><Text style={x.cardTitle}>Cửa đang {door.lockState === 'LOCKED' ? 'khóa' : 'mở'}</Text><Text style={x.sub}>Cập nhật {door.lastUpdate}</Text><Status online={door.connectivity === 'ONLINE'} /></Card>{canRemoteUnlock(door) && <Button title="Mở cửa từ xa" icon="lock-open-outline" onPress={unlock} />}{owner && <><Text style={x.section}>Quản lý</Text><Menu icon="people-outline" label="Thành viên" onPress={members} /><Menu icon="shield-checkmark-outline" label="Duyệt ảnh xác thực" onPress={approvals} /><Menu icon="scan-outline" label="Khuôn mặt & xác thực" onPress={() => Alert.alert('Khuôn mặt & xác thực', 'Tính năng sẵn sàng kết nối SDK/ESP32.')} /><Menu icon="time-outline" label="Lịch sử ra vào" onPress={history} /><Menu icon="settings-outline" label="Cài đặt thiết bị" onPress={() => Alert.alert('Cài đặt thiết bị', 'Cài đặt được quản lý qua backend khi kết nối.')} /></>}{!owner && <><Card style={x.faceRequired}><View style={x.row}>{icon('scan-outline', colors.warning)}<View style={{ flex: 1 }}><Text style={x.cardTitle}>Chưa có khuôn mặt của bạn</Text><Text style={x.sub}>Tải hoặc chụp ảnh để chủ cửa duyệt cấu hình cho cửa này.</Text></View></View><Button title="Thiết lập khuôn mặt" variant="ghost" icon="camera-outline" onPress={setupFace} /></Card><Menu icon="time-outline" label="Lịch sử được cho phép" onPress={history} /></>}</ScrollView>; }
function Members({ people, unitId, refresh, back, add, select }: { people: Person[]; unitId: number | null; refresh: () => Promise<void>; back: () => void; add: () => void; select: (person: Person) => void }) { const toggle = async (p: Person) => { if (!unitId) return; try { await managerService.setAccess(unitId, Number(p.id), p.access !== 'ACTIVE'); await refresh(); } catch (e) { Alert.alert('Không đổi được quyền', errorText(e, 'Vui lòng thử lại.')); } }; return <ScrollView contentContainerStyle={x.page}><Back onPress={back} /><View style={x.row}><Text style={x.title}>Quản lý thành viên</Text><Pressable onPress={add} accessibilityLabel="Thêm thành viên">{icon('person-add-outline')}</Pressable></View><Text style={x.sub}>{people.length} thành viên · Chạm vào thành viên để quản lý</Text>{!people.length && <Empty title="Cửa này chưa có thành viên" />}<Input value="" onChangeText={() => {}} placeholder="Tìm kiếm thành viên" />{people.map(p => <Pressable key={p.id} onPress={() => select(p)}><Card style={x.member}><View style={x.avatar}><Text style={x.avatarText}>{p.name.charAt(0)}</Text></View><View style={{ flex: 1 }}><Text style={x.cardTitle}>{p.name}</Text><Text style={x.sub}>{p.hasAccount ? 'Có ứng dụng' : 'Không có ứng dụng'} · {p.methods.join(', ')}</Text><Text style={[x.caption, { color: p.access === 'ACTIVE' ? colors.success : colors.warning }]}>{p.access === 'ACTIVE' ? 'Đang cho phép' : 'Đã tạm khóa'} · {p.sync === 'PENDING' ? 'Đang đồng bộ' : 'Đã đồng bộ'}</Text></View><Switch value={p.access === 'ACTIVE'} onValueChange={() => { void toggle(p); }} trackColor={{ true: '#AFAAF5' }} thumbColor={p.access === 'ACTIVE' ? colors.primary : '#fff'} /></Card></Pressable>)}</ScrollView>; }
function AddMemberChoice({ back, chooseApp, choosePerson }: { back: () => void; chooseApp: () => void; choosePerson: () => void }) { return <ScrollView contentContainerStyle={x.page}><Back onPress={back} /><Text style={x.title}>Thêm thành viên</Text><Text style={x.sub}>Chọn đúng loại hồ sơ để cấp quyền cho cửa này.</Text><Pressable onPress={chooseApp}><Card style={x.choice}><View style={x.choiceIcon}>{icon('phone-portrait-outline')}</View><View style={{ flex: 1 }}><Text style={x.cardTitle}>Người đã có ứng dụng</Text><Text style={x.sub}>Tìm theo email tài khoản rồi thêm thẳng vào cửa.</Text></View>{icon('chevron-forward-outline', colors.muted)}</Card></Pressable><Pressable onPress={choosePerson}><Card style={x.choice}><View style={x.choiceIcon}>{icon('person-outline')}</View><View style={{ flex: 1 }}><Text style={x.cardTitle}>Người chưa có ứng dụng</Text><Text style={x.sub}>Cần tự đăng ký tài khoản trên ứng dụng trước.</Text></View>{icon('chevron-forward-outline', colors.muted)}</Card></Pressable></ScrollView>; }
function PhotoPicker({ value, onChange, onAsset }: { value: string | null; onChange: (uri: string) => void; onAsset?: (asset: ImagePicker.ImagePickerAsset) => void }) {
  const select = (asset: ImagePicker.ImagePickerAsset) => { if (onAsset) { validateImage(asset); onAsset(asset); } onChange(asset.uri); };
  const library = async () => { try { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: .7 }); if (!result.canceled) select(result.assets[0]); } catch (e) { Alert.alert('Không chọn được ảnh', e instanceof Error ? e.message : 'Vui lòng thử lại.'); } };
  const camera = async () => { try { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) return Alert.alert('Cần quyền camera', 'Hãy cấp quyền camera để chụp ảnh xác thực.'); const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: .7 }); if (!result.canceled) select(result.assets[0]); } catch (e) { Alert.alert('Không chụp được ảnh', e instanceof Error ? e.message : 'Vui lòng thử lại.'); } };
  return <View style={{ gap: 10 }}>{value ? <Image source={{ uri: value }} style={x.photo} /> : <View style={x.photoEmpty}>{icon('camera-outline', '#A8B2E9')}<Text style={x.caption}>Chưa có ảnh xác thực</Text></View>}<View style={x.actionRow}><View style={{ flex: 1 }}><Button title="Chụp ảnh" variant="ghost" icon="camera-outline" onPress={camera} /></View><View style={{ flex: 1 }}><Button title="Tải ảnh" variant="ghost" icon="images-outline" onPress={library} /></View></View></View>;
}
function ExistingAppMember({ unitId, back, done }: { unitId: number | null; back: () => void; done: () => Promise<void> }) {
  const [email, setEmail] = useState(''); const [found, setFound] = useState<UserSearchDto | null>(null); const [busy, setBusy] = useState(false);
  const lookup = async () => {
    if (!email.trim()) return Alert.alert('Chưa nhập thông tin', 'Nhập email hoặc mã tài khoản cần tìm.');
    setBusy(true);
    try {
      const [match] = await managerService.searchUsers(email);
      if (!match) Alert.alert('Không tìm thấy', 'Chưa có tài khoản nào với email này. Người đó cần đăng ký ứng dụng trước.');
      setFound(match ?? null);
    } catch (e) { Alert.alert('Không tìm được', errorText(e, 'Vui lòng thử lại.')); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!found || !unitId) return;
    setBusy(true);
    try {
      await managerService.addUser(unitId, found.id);
      Alert.alert('Đã thêm thành viên', `${found.displayName} đã được thêm vào cửa với quyền vân tay, RFID và mở từ xa.`);
      await done();
    } catch (e) { Alert.alert('Không thêm được', errorText(e, 'Vui lòng thử lại.')); } finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={x.page}><Back onPress={back} /><Text style={x.title}>Người đã có ứng dụng</Text><Text style={x.sub}>Nhập email để tìm tài khoản, sau đó thêm thẳng vào cửa này.</Text><Text style={x.label}>Email tài khoản</Text><Input value={email} onChangeText={value => { setEmail(value); setFound(null); }} placeholder="email@example.com" keyboardType="email-address" />{!found ? <Button title={busy ? 'Đang tìm...' : 'Tìm tài khoản'} variant="ghost" disabled={busy} onPress={() => { void lookup(); }} /> : <Card style={x.accountFound}><View style={x.avatar}><Text style={x.avatarText}>{found.displayName.charAt(0).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={x.cardTitle}>{found.displayName}</Text><Text style={x.sub}>{found.email ?? `Mã tài khoản ${found.id}`}</Text><Text style={[x.caption, { color: found.status === 'ACTIVE' ? colors.success : colors.error }]}>{found.status === 'ACTIVE' ? 'Tài khoản đang hoạt động' : 'Tài khoản đã bị khóa'}</Text></View>{icon('checkmark-circle', colors.success)}</Card>}<Button title={busy && found ? 'Đang thêm...' : 'Thêm vào cửa'} disabled={!found || busy} onPress={() => { void submit(); }} /></ScrollView>;
}
function UserVerification({ doors, initialDoorName, back }: { doors: Door[]; initialDoorName?: string; back: () => void }) { const [doorId, setDoorId] = useState(() => doors.find(item => item.name === initialDoorName)?.id ?? doors[0]?.id ?? ''); const [photo, setPhoto] = useState<string | null>(null); const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null); const [uploadError, setUploadError] = useState(''); const [uploadedId, setUploadedId] = useState(''); const [consent, setConsent] = useState(false); const [saving, setSaving] = useState(false); const submit = async () => { const door = doors.find(item => item.id === doorId); if (!door || !photo || !consent) return Alert.alert('Thiếu thông tin', 'Chọn cửa, tải ảnh và xác nhận sự đồng ý.'); setSaving(true); setUploadError(''); setUploadedId(''); try { if (!asset) throw new Error('Vui lòng chọn lại ảnh.'); const uploaded = await uploadService.upload(asset); setUploadedId(uploaded.id); Alert.alert('Đã tải ảnh', 'Ảnh đã tải thành công. Chức năng gửi yêu cầu duyệt chưa sẵn sàng.'); } catch (e) { setUploadError(e instanceof Error ? e.message : 'Không tải được ảnh.'); } finally { setSaving(false); } }; return <ScrollView contentContainerStyle={x.page}><Back onPress={back} /><Text style={x.title}>Thiết lập khuôn mặt</Text><Text style={x.sub}>Chụp hoặc chọn ảnh khuôn mặt để tải lên. Yêu cầu duyệt sẽ được kết nối sau.</Text>{doors.length ? <>{doors.map(door => <Pressable key={door.id} onPress={() => setDoorId(door.id)}><Card style={[x.choice, door.id === doorId && { borderWidth: 1, borderColor: colors.primary }]}><View style={{ flex: 1 }}><Text style={x.cardTitle}>{door.name}</Text><Text style={x.sub}>{door.id === doorId ? 'Đã chọn' : 'Chọn cửa này'}</Text></View>{icon(door.id === doorId ? 'checkmark-circle' : 'ellipse-outline', door.id === doorId ? colors.primary : colors.muted)}</Card></Pressable>)}<Text style={x.label}>Ảnh khuôn mặt</Text><PhotoPicker value={photo} onChange={setPhoto} onAsset={value => { setAsset(value); setUploadError(''); setUploadedId(''); }} /><View style={x.row}><Switch value={consent} onValueChange={setConsent} /><Text style={[x.caption, { flex: 1 }]}>Tôi đồng ý tải ảnh khuôn mặt lên hệ thống.</Text></View>{uploadError ? <Text style={{ color: colors.error }}>{uploadError}</Text> : null}{uploadedId ? <Text style={{ color: colors.success }}>Đã tải ảnh: {uploadedId}</Text> : null}<Button title={saving ? 'Đang tải ảnh...' : 'Upload ảnh'} disabled={saving} onPress={submit} /></> : <Empty title="Bạn chưa có cửa được chia sẻ" />}</ScrollView>; }
function Approvals({ door, back }: { door: Door; back: () => void }) { const [requests, setRequests] = useState<VerificationRequest[]>([]); const refresh = async () => setRequests(await smartDoorService.listVerificationRequests(door.id)); useEffect(() => { void refresh(); }, [door.id]); const decide = async (id: string, approved: boolean) => { await smartDoorService.resolveVerification(id, approved); await refresh(); }; return <ScrollView contentContainerStyle={x.page}><Back onPress={back} /><Text style={x.title}>Duyệt ảnh xác thực</Text><Text style={x.sub}>{door.name} · chỉ chủ cửa có thể duyệt</Text>{requests.length ? requests.map(request => <Card key={request.id} style={{ gap: 12 }}><Image source={{ uri: request.photoUri }} style={x.requestPhoto} /><Text style={x.cardTitle}>{request.requester}</Text><Text style={x.sub}>Gửi {request.createdAt} · {request.status === 'PENDING' ? 'Đang chờ duyệt' : request.status === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối'}</Text>{request.status === 'PENDING' && <View style={x.actionRow}><View style={{ flex: 1 }}><Button title="Từ chối" variant="ghost" onPress={() => decide(request.id, false)} /></View><View style={{ flex: 1 }}><Button title="Duyệt" onPress={() => decide(request.id, true)} /></View></View>}</Card>) : <Empty title="Chưa có ảnh chờ duyệt" />}</ScrollView>; }
function MemberDetail({ person, unitId, refresh, back }: { person: Person; unitId: number | null; refresh: () => Promise<void>; back: () => void }) {
  const [consent, setConsent] = useState(false); const [enrolling, setEnrolling] = useState(false);
  const userId = /^[1-9]\d*$/.test(person.id) ? Number(person.id) : null;
  // Hộp thoại thêm vân tay: chờ thiết bị → thành công / thất bại
  const [fp, setFp] = useState<{ state: 'IDLE' | 'WAITING' | 'SUCCESS' | 'FAILED'; message: string }>({ state: 'IDLE', message: '' });
  const enrollFingerprint = async () => {
    if (!unitId || !userId || fp.state === 'WAITING') return;
    setFp({ state: 'WAITING', message: `Yêu cầu ${person.name} đặt ngón tay lên cảm biến của cửa.` });
    try {
      const label = `Vân tay ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
      const result = await managerService.waitForCommand(await managerService.enrollFingerprint(unitId, userId, label));
      if (result.status === 'ACKNOWLEDGED') { setFp({ state: 'SUCCESS', message: `Thêm vân tay thành công cho ${person.name}.` }); await refresh(); }
      else setFp({ state: 'FAILED', message: commandMessage(result, '') });
    } catch (e) { setFp({ state: 'FAILED', message: errorText(e, 'Không gửi được lệnh tới thiết bị.') }); }
  };
  // Gán thẻ RFID có sẵn: chỉ cần nhập mã thẻ
  const [rfidOpen, setRfidOpen] = useState(false); const [rfidUid, setRfidUid] = useState(''); const [rfidSaving, setRfidSaving] = useState(false);
  const assignRfid = async () => {
    if (!unitId || !userId) return;
    if (rfidUid.trim().length < 4) return Alert.alert('Mã thẻ chưa hợp lệ', 'Nhập mã thẻ (UID) in trên thẻ, ví dụ A1B2C3D4.');
    setRfidSaving(true);
    try {
      const card = await managerService.assignRfid(unitId, userId, rfidUid);
      setRfidOpen(false); setRfidUid('');
      Alert.alert('Gán thẻ thành công', `Thẻ ${card.rfidUid} đã được gán cho ${person.name}.`);
      await refresh();
    } catch (e) { Alert.alert('Không gán được thẻ', errorText(e, 'Vui lòng thử lại.')); } finally { setRfidSaving(false); }
  };
  const accessActive = person.access === 'ACTIVE';
  const enrollFace = async () => { if (!consent) return Alert.alert('Cần có sự đồng ý', 'Bạn cần xác nhận người này đồng ý thu thập dữ liệu khuôn mặt trước khi tiếp tục.'); setEnrolling(true); await new Promise(resolve => setTimeout(resolve, 900)); setEnrolling(false); Alert.alert('Chờ tích hợp', 'Ảnh không được lưu trong ứng dụng demo. Hãy kết nối camera, dịch vụ sinh trắc học và đồng bộ ESP32 để đăng ký thật.'); };
  const toggleAccess = async () => {
    if (!unitId || !userId) return;
    try { await managerService.setAccess(unitId, userId, !accessActive); await refresh(); back(); }
    catch (e) { Alert.alert('Không đổi được quyền', errorText(e, 'Vui lòng thử lại.')); }
  };
  const remove = () => Alert.alert('Xóa thành viên?', `Xóa ${person.name} khỏi cửa này? Thao tác này không thể hoàn tác.`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: async () => {
    if (!unitId || !userId) return;
    try { await managerService.removeUser(unitId, userId); await refresh(); back(); }
    catch (e) { Alert.alert('Không xóa được', errorText(e, 'Vui lòng thử lại.')); }
  } }]);
  return <ScrollView contentContainerStyle={x.page}><Back onPress={back} /><Text style={x.title}>Quản lý thành viên</Text><Card style={x.profile}><View style={x.profileAvatar}><Text style={x.profileInitial}>{person.name.charAt(0)}</Text></View><View><Text style={x.cardTitle}>{person.name}</Text><Text style={x.sub}>{person.hasAccount ? 'Có tài khoản ứng dụng' : 'Hồ sơ không có ứng dụng'}</Text><Text style={x.caption}>Đồng bộ: {person.sync === 'PENDING' ? 'Đang chờ thiết bị' : 'Đã đồng bộ'}</Text></View></Card><Card style={{ gap: 12 }}><View style={x.row}><View style={{ flex: 1 }}><Text style={x.cardTitle}>Cho phép ra vào</Text><Text style={x.sub}>Quyền chỉ áp dụng cho cửa hiện tại.</Text></View><Switch value={accessActive} onValueChange={() => { void toggleAccess(); }} trackColor={{ true: '#AFAAF5' }} thumbColor={accessActive ? colors.primary : '#fff'} /></View>{person.sync === 'PENDING' && <Text style={[x.caption, { color: colors.warning }]}>Thiết bị chưa xác nhận thay đổi quyền vì đang chờ đồng bộ.</Text>}</Card><Text style={x.section}>Xác thực</Text><Card style={{ gap: 12 }}><View style={x.row}>{icon('scan-outline')}<View style={{ flex: 1 }}><Text style={x.cardTitle}>Khuôn mặt</Text><Text style={x.sub}>{person.methods.includes('Khuôn mặt') ? 'Đã đăng ký' : 'Chưa đăng ký'}</Text></View></View><View style={x.faceFrame}>{icon('person-outline', '#A8B2E9')}<Text style={x.caption}>Không hiển thị hay lưu ảnh khuôn mặt trong bản demo</Text></View><View style={x.row}><Switch value={consent} onValueChange={setConsent} /><Text style={[x.caption, { flex: 1 }]}>Tôi xác nhận đã nhận được sự đồng ý của người này để thu thập dữ liệu khuôn mặt.</Text></View><Button title={enrolling ? 'Đang xử lý...' : 'Tạo ảnh khuôn mặt'} icon="camera-outline" disabled={enrolling} onPress={enrollFace} /></Card><Menu icon="card-outline" label="Gán thẻ RFID" onPress={() => setRfidOpen(true)} /><Menu icon="finger-print-outline" label="Thêm vân tay" onPress={() => { void enrollFingerprint(); }} />
    <AppModal visible={fp.state !== 'IDLE'} title="Thêm vân tay" onClose={() => { if (fp.state !== 'WAITING') setFp({ state: 'IDLE', message: '' }); }}>
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
        {fp.state === 'WAITING' ? <ActivityIndicator size="large" color={colors.primary} /> : icon(fp.state === 'SUCCESS' ? 'checkmark-circle' : 'close-circle', fp.state === 'SUCCESS' ? colors.success : colors.error)}
        <Text style={[x.cardTitle, { textAlign: 'center' }]}>{fp.state === 'WAITING' ? 'Đang chờ đặt ngón tay...' : fp.state === 'SUCCESS' ? 'Thêm vân tay thành công' : 'Thêm vân tay thất bại'}</Text>
        <Text style={[x.sub, { textAlign: 'center' }]}>{fp.message}</Text>
      </View>
      {fp.state !== 'WAITING' && <Button title="Đóng" onPress={() => setFp({ state: 'IDLE', message: '' })} />}
    </AppModal>
    <AppModal visible={rfidOpen} title="Gán thẻ RFID" onClose={() => { if (!rfidSaving) setRfidOpen(false); }}>
      <Text style={x.sub}>Nhập mã thẻ (UID) của thẻ đã dùng được với cửa này để gán cho {person.name}.</Text>
      <Input value={rfidUid} onChangeText={v => setRfidUid(v.toUpperCase())} placeholder="Ví dụ: A1B2C3D4" />
      <Button title={rfidSaving ? 'Đang gán thẻ...' : 'Gán thẻ'} disabled={rfidSaving} onPress={() => { void assignRfid(); }} />
    </AppModal><Text style={x.section}>Hoạt động gần đây</Text><Card><Text style={x.cardTitle}>Chưa có sự kiện mới</Text><Text style={x.sub}>Lịch sử cá nhân sẽ được tải theo quyền được backend cấp.</Text></Card><Button title="Xóa thành viên" variant="danger" onPress={remove} /></ScrollView>;
}
// Không có bảng lời mời: tab này liệt kê các cửa mà chủ cửa đã thêm bạn vào.
function Invitations({ doors, onOpen, onLeave }: { doors: Door[]; onOpen: (door: Door) => void; onLeave: (door: Door) => Promise<void> }) {
  const leave = (door: Door) => Alert.alert('Rời cửa?', `Bạn sẽ không còn quyền ra vào ${door.name}.`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Rời cửa', style: 'destructive', onPress: async () => {
    try { await onLeave(door); } catch (e) { Alert.alert('Không rời được cửa', errorText(e, 'Vui lòng thử lại.')); }
  } }]);
  return <ScrollView contentContainerStyle={x.page}><Text style={x.title}>Cửa được chia sẻ</Text><Text style={x.sub}>Các cửa chủ cửa đã thêm bạn làm thành viên</Text>{doors.map(d => <Card key={d.id} style={{ gap: 12 }}><View style={x.row}><View style={x.doorIcon}>{icon('mail-open-outline')}</View><View style={{ flex: 1 }}><Text style={x.cardTitle}>{d.name}</Text><Text style={x.sub}>Thành viên · {d.connectivity === 'ONLINE' ? 'Thiết bị trực tuyến' : 'Thiết bị ngoại tuyến'}</Text></View></View><View style={x.actionRow}><View style={{ flex: 1 }}><Button title="Rời cửa" variant="ghost" onPress={() => leave(d)} /></View><View style={{ flex: 1 }}><Button title="Mở" onPress={() => onOpen(d)} /></View></View></Card>)}{!doors.length && <Empty title="Chưa có cửa nào được chia sẻ cho bạn" />}<View style={{ height: 100 }} /></ScrollView>;
}
function Profile({ account, logout, verify, notifications }: { account: AccountDto; notifications: () => void; logout: () => void; verify: () => void }) { return <ScrollView contentContainerStyle={x.page}><Text style={x.title}>Cá nhân</Text><Card style={x.profile}><View style={x.profileAvatar}><Text style={x.profileInitial}>{account.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase() ?? '?'}</Text></View><View><Text style={x.cardTitle}>{account.fullName}</Text><Text style={x.sub}>{account.email ?? account.phone ?? ''}</Text></View></Card>{[['person-outline', 'Thông tin cá nhân'], ['key-outline', 'Đổi mật khẩu'], ['shield-checkmark-outline', 'Đổi mã PIN'], ['finger-print-outline', 'Phương thức xác thực của tôi'], ['notifications-outline', 'Thông báo'], ['settings-outline', 'Cài đặt']].map(([i, label]) => <Menu key={label} icon={i as keyof typeof Ionicons.glyphMap} label={label} onPress={() => label === 'Phương thức xác thực của tôi' ? verify() : label === 'Thông báo' ? notifications() : Alert.alert(label, 'Tính năng sẽ đồng bộ cùng tài khoản khi kết nối backend.')} />)}<Button title="Đăng xuất" variant="danger" onPress={logout} /></ScrollView>; }
function AddDevice({ open, close, onCreated }: { open: boolean; close: () => void; onCreated: () => Promise<void> }) { const [step, setStep] = useState(0); const [code, setCode] = useState(''); const [wifi, setWifi] = useState(''); const [name, setName] = useState(''); const [verified, setVerified] = useState(false); const [saving, setSaving] = useState(false); useEffect(() => { if (!open) { setStep(0); setCode(''); setWifi(''); setName(''); setVerified(false); } }, [open]); const next = async () => { if (step === 1 && code.trim().length < 6) return Alert.alert('Mã chưa hợp lệ', 'Nhập mã thiết bị (device UID) gồm ít nhất 6 ký tự, ví dụ ESP32-DEMO-02.'); if (step === 2 && !verified) return Alert.alert('Cần xác minh', 'Xác nhận bạn đang có quyền sở hữu mã provisioning này.'); if (step === 4) { if (!name.trim()) return Alert.alert('Thiếu tên cửa', 'Vui lòng đặt tên cho cửa mới.'); try { setSaving(true); await unitService.create(name.trim(), code.trim()); await onCreated(); Alert.alert('Đăng ký thành công', 'Đã tạo cửa và gắn thiết bị. Thiết bị sẽ hiện trực tuyến khi kết nối được MQTT.'); close(); } catch (error) { Alert.alert('Không thể đăng ký', error instanceof Error ? error.message : 'Vui lòng thử lại.'); } finally { setSaving(false); } return; } setStep(step + 1); }; return <AppModal visible={open} title={step ? `Đăng ký thiết bị · Bước ${step}/4` : 'Thêm thiết bị mới'} onClose={close}>{step === 0 ? <><Text style={x.sub}>Quét QR provisioning hoặc nhập mã chỉ có trong bộ sản phẩm.</Text><Menu icon="qr-code-outline" label="Quét mã QR" onPress={() => setStep(1)} /><Menu icon="keypad-outline" label="Nhập mã thiết bị" onPress={() => setStep(1)} /></> : <><Text style={x.caption}>{step === 1 ? 'Mã công khai/serial không đủ để nhận quyền sở hữu.' : step === 2 ? 'Xác minh quyền sở hữu trước khi cấu hình thiết bị.' : step === 3 ? 'Kết nối Wi‑Fi chỉ được gửi qua kênh provisioning bảo mật.' : 'Đặt tên để nhận diện cửa.'}</Text>{step === 1 && <Input value={code} onChangeText={setCode} placeholder="Mã provisioning" />}{step === 2 && <View style={x.row}><Switch value={verified} onValueChange={setVerified} /><Text style={[x.caption, { flex: 1 }]}>Tôi xác nhận đang sở hữu thiết bị và mã provisioning.</Text></View>}{step === 3 && <Input value={wifi} onChangeText={setWifi} placeholder="Tên Wi‑Fi (không bắt buộc)" />}{step === 4 && <Input value={name} onChangeText={setName} placeholder="Ví dụ: Cửa nhà riêng" />}<Button title={saving ? 'Đang đăng ký...' : step === 4 ? 'Hoàn tất đăng ký' : 'Tiếp tục'} disabled={saving} onPress={next} /></>}</AppModal>; }
function PinModal({ door, close }: { door: Door | null; close: () => void }) {
  const [state, setState] = useState<'IDLE' | 'VERIFYING' | 'SUCCESS' | 'FAILED'>('IDLE'); const [error, setError] = useState('');
  useEffect(() => { if (!door) { setState('IDLE'); setError(''); } }, [door]);
  const unitId = backendUnitId(door);
  const send = async () => {
    if (!unitId) return;
    setState('VERIFYING'); setError('');
    try {
      const result = await managerService.waitForCommand(await managerService.remoteUnlock(unitId));
      if (result.status === 'ACKNOWLEDGED') setState('SUCCESS');
      else { setError(commandMessage(result, '')); setState('FAILED'); }
    } catch (e) { setError(errorText(e, 'Không gửi được lệnh.')); setState('FAILED'); }
  };
  const message = state === 'SUCCESS' ? 'Thiết bị đã xác nhận. Cửa đã mở.' : state === 'VERIFYING' ? 'Đang chờ thiết bị xác nhận...' : state === 'FAILED' ? error : 'Lệnh mở cửa sẽ được gửi tới thiết bị qua backend.';
  return <AppModal visible={!!door} title="Xác nhận mở cửa" onClose={close}><Text style={x.sub}>Mở {door?.name} từ xa</Text><Text style={[x.caption, { color: state === 'SUCCESS' ? colors.success : state === 'FAILED' ? colors.error : colors.muted }]}>{message}</Text>{state === 'SUCCESS' ? <Button title="Đóng" onPress={close} /> : <Button title={state === 'VERIFYING' ? 'Đang xác nhận...' : 'Mở cửa'} onPress={() => { void send(); }} disabled={state === 'VERIFYING'} />}</AppModal>;
}
function Menu({ icon: i, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) { return <Pressable onPress={onPress}><Card style={x.menu}>{icon(i)}<Text style={[x.cardTitle, { flex: 1 }]}>{label}</Text>{icon('chevron-forward-outline', colors.muted)}</Card></Pressable>; }
function Back({ onPress }: { onPress: () => void }) { return <Pressable onPress={onPress} style={x.back}>{icon('arrow-back-outline')}</Pressable>; }
function Empty({ title, action }: { title: string; action?: () => void }) { return <Card style={x.empty}>{icon('folder-open-outline', colors.muted)}<Text style={x.cardTitle}>{title}</Text>{action && <Button title="Thêm thiết bị" onPress={action} />}</Card>; }
const x = StyleSheet.create({
  page: { padding: 20, gap: 16, paddingBottom: 120 }, splash: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', gap: 16 }, logo: { color: '#fff', fontSize: 30, fontWeight: '800' }, slogan: { color: '#E5E7FF', fontSize: 15 }, auth: { padding: 24, flexGrow: 1, justifyContent: 'center', gap: 16 }, brand: { width: 70, height: 70, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, alignSelf: 'center' }, brandText: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 3 }, title: { color: colors.text, fontSize: 26, fontWeight: '800' }, greeting: { color: colors.text, fontSize: 21, fontWeight: '800' }, sub: { color: colors.muted, fontSize: 14, lineHeight: 20 }, label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 3 }, link: { color: colors.primary, textAlign: 'center', fontSize: 14, fontWeight: '700' }, switchText: { color: colors.muted, textAlign: 'center', fontSize: 14 }, eye: { position: 'absolute', right: 14, top: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, summary: { backgroundColor: '#EEF0FF', gap: 5 }, summaryLabel: { color: colors.primary, fontSize: 14, fontWeight: '700' }, big: { color: colors.text, fontSize: 30, fontWeight: '800' }, online: { color: colors.success, fontSize: 13, fontWeight: '700' }, section: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4 }, door: { gap: 2 }, doorIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#EEF0FF', alignItems: 'center', justifyContent: 'center' }, cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' }, offline: { color: colors.warning, fontSize: 13, fontWeight: '700', marginTop: 16 }, device: { gap: 2 }, hero: { alignItems: 'center', gap: 10, paddingVertical: 28 }, largeLock: { width: 76, height: 76, borderRadius: 26, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary }, faceRequired: { backgroundColor: '#FFF9ED', gap: 14 }, menu: { borderRadius: 16, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 12, shadowOpacity: .1 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 13 }, choiceIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#EEF0FF', justifyContent: 'center', alignItems: 'center' }, accountFound: { flexDirection: 'row', alignItems: 'center', gap: 12 }, photoEmpty: { height: 180, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: '#C8D0FA', backgroundColor: '#F6F7FF', alignItems: 'center', justifyContent: 'center', gap: 9 }, photo: { height: 220, borderRadius: 18, width: '100%', resizeMode: 'cover' }, requestPhoto: { height: 220, borderRadius: 16, width: '100%', resizeMode: 'cover' }, back: { width: 42, height: 42, justifyContent: 'center' }, member: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#DDE2FF', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.primary, fontWeight: '800' }, faceFrame: { height: 134, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: '#C8D0FA', backgroundColor: '#F6F7FF', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 }, caption: { fontSize: 12, color: colors.muted, lineHeight: 18 }, actionRow: { flexDirection: 'row', gap: 10 }, filters: { flexDirection: 'row', gap: 10 }, filterActive: { backgroundColor: '#E7E8FF', color: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, fontWeight: '700' }, filter: { color: colors.muted, paddingHorizontal: 12, paddingVertical: 8 }, log: { flexDirection: 'row', gap: 12, alignItems: 'center' }, logIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, profile: { flexDirection: 'row', alignItems: 'center', gap: 14 }, profileAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, profileInitial: { color: '#fff', fontSize: 22, fontWeight: '800' }, empty: { alignItems: 'center', gap: 14, marginTop: 28 }
});

import { ItemList } from '../src/components/ItemList';
import { Brand } from '../src/components/Brand';
import { MemberPermissions } from '../src/components/MemberPermissions';
import { CredentialEnrollment } from '../src/components/CredentialEnrollment';
import { Ionicons } from '@expo/vector-icons';
import { ActivationWizard as AddDevice } from '../src/components/ActivationWizard';
import { OwnerDeviceSettings } from '../src/components/OwnerDeviceSettings';
import { GlobalFaceRegistration } from '../src/components/GlobalFaceRegistration';
import { RealInvitations } from '../src/components/RealInvitations';
import {
  AccountSettings,
  PersonalInformation,
  ChangePassword,
  SignOutButton,
} from '../src/components/AccountSettings';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  AppModal,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  Notice,
  PageHeader,
  Screen,
  Status,
} from '../src/components/ui';
import { FloatingNav, TabKey } from '../src/components/FloatingNav';
import { Door, Person } from '../src/models/domain';
import { FaceApprovals, MemberFacePanel } from '../src/components/FaceEnrollment';
import { AccountDto, authService } from '../src/services/api/authService';
import {
  CommandDto,
  managerService,
  UnitUserDto,
  UserSearchDto,
} from '../src/services/api/managerService';
import { toDoor, unitService } from '../src/services/api/unitService';
import { ApiError } from '../src/services/api/client';
import { subscribeUpdates } from '../src/services/api/realtime';
import { useNotificationBanner } from '../src/components/EventNotificationProvider';
import { AccessHistory } from '../src/components/AccessHistory';
import { Alerts } from '../src/components/Alerts';
import { useConfirm } from '../src/components/ConfirmationProvider';
import { colors } from '../src/theme/tokens';
import { canManageDoor, canRemoteUnlock, canRemoteLock } from '../src/utils/permissions';
import { memberContactLabel } from '../src/utils/memberProfileInput';
import { NewPersonMember } from '../src/components/NewPersonMember';

type ViewName =
  | TabKey
  | 'detail'
  | 'members'
  | 'member-detail'
  | 'add-member'
  | 'invite-member'
  | 'new-person-member'
  | 'user-verification'
  | 'approvals'
  | 'history'
  | 'alerts'
  | 'settings'
  | 'account'
  | 'password'
  | 'account-settings';
const icon = (name: keyof typeof Ionicons.glyphMap, color: string = colors.primary) => (
  <Ionicons name={name} size={23} color={color} />
);
// Door.id chính là unit_id của backend.
const backendUnitId = (door?: Door | null) =>
  door && /^[1-9]\d*$/.test(door.id) ? Number(door.id) : null;
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
// Mã lỗi firmware → câu tiếng Việt cho người dùng; mã lạ hiển thị nguyên văn.
const deviceErrors: Record<string, string> = {
  FINGER_MISMATCH: 'Hai lần quét không khớp. Đặt cùng một ngón, cùng vị trí rồi thử lại.',
  ENROLL_TIMEOUT: 'Hết 45 giây mà chưa quét đủ 2 lần. Thử lại và quét ngay sau khi bấm.',
  SENSOR_NOT_READY: 'Cảm biến vân tay chưa sẵn sàng. Kiểm tra dây nối cảm biến rồi thử lại.',
  SENSOR_READ_FAILED: 'Không đọc được bộ nhớ cảm biến (dây UART chập chờn). Thử lại.',
  SENSOR_FULL: 'Bộ nhớ cảm biến vân tay đã đầy.',
  SENSOR_STORE_FAILED: 'Cảm biến không lưu được mẫu vân tay. Thử lại.',
  SLOT_OCCUPIED: 'Ô nhớ cảm biến vừa bị chiếm. Thử lại.',
  SLOT_CONFLICT: 'Ô nhớ cảm biến trùng với vân tay khác. Thử lại.',
  DEVICE_BUSY: 'Cửa đang bận đăng ký thẻ/vân tay khác. Chờ xong rồi thử lại.',
  INVALID_OR_OCCUPIED_SLOT:
    'Cảm biến chưa sẵn sàng hoặc ô nhớ đã có dữ liệu cũ. Cập nhật firmware cửa rồi thử lại.',
};
const commandMessage = (command: CommandDto, success: string) =>
  command.status === 'ACKNOWLEDGED'
    ? success
    : command.status === 'TIMEOUT'
      ? 'Thiết bị không phản hồi kịp.'
      : ((command.resultMessage && deviceErrors[command.resultMessage]) ??
        command.resultMessage ??
        'Thiết bị báo thất bại.');
const toPerson = (u: UnitUserDto): Person => ({
  id: String(u.userId),
  name: u.displayName,
  hasAccount: u.hasLoggedIn,
  room: u.room,
  contact: u.phone ?? u.email,
  deletableAccount: u.deletableAccount,
  removalPending: u.removalPending,
  methods: [
    u.allowFace && 'Khuôn mặt',
    u.allowFingerprint && 'Vân tay',
    u.allowRfid && 'RFID',
    u.allowRemoteUnlock && 'Mở từ xa',
  ].filter((m): m is string => !!m),
  access:
    u.accountStatus === 'ACTIVE' &&
    (u.allowFace || u.allowFingerprint || u.allowRfid || u.allowRemoteUnlock)
      ? 'ACTIVE'
      : 'SUSPENDED',
  sync: u.removalPending ? 'PENDING' : 'SYNCED',
});

export default function App() {
  return <SmartDoorApp />;
}
function SmartDoorApp() {
  const [booting, setBooting] = useState(true);
  const [account, setAccount] = useState<AccountDto | null>(null);
  const authenticated = account !== null;
  const [registering, setRegistering] = useState(false);
  const { setEnabled, openAlerts: openAlertsRef } = useNotificationBanner();
  const [view, setView] = useState<ViewName>('home');
  const [doors, setDoors] = useState<Door[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [pinDoor, setPinDoor] = useState<Door | null>(null);
  const [selected, setSelected] = useState<Door | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [, setVerificationDoorName] = useState<string | undefined>();
  useEffect(() => {
    setEnabled(authenticated);
    return () => setEnabled(false);
  }, [authenticated, setEnabled]);
  useEffect(() => {
    openAlertsRef.current = () => {
      setAddOpen(false);
      setPinDoor(null);
      setView('alerts');
    };
    return () => {
      openAlertsRef.current = undefined;
    };
  }, [openAlertsRef]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const loadMembers = async (door: Door | null) => {
    const unitId = backendUnitId(door);
    if (!unitId) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    setMembersError('');
    try {
      const users = await managerService.listUnitUsers(unitId);
      const people = users.map(toPerson);
      setMembers(people);
      setSelectedPerson((current) =>
        current ? (people.find((p) => p.id === current.id) ?? current) : current,
      );
    } catch (e) {
      setMembersError(errorText(e, 'Không tải được thành viên. Vui lòng thử lại.'));
    } finally {
      setMembersLoading(false);
    }
  };
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const load = async (silent = false) => {
    if (!silent) setDataLoading(true);
    try {
      const next = (await unitService.listMine()).map(toDoor);
      setDoors(next);
      setDataError('');
      // Màn chi tiết đang mở cũng nhận trạng thái mới (trực tuyến/ngoại tuyến)
      setSelected((current) =>
        current ? (next.find((d) => d.id === current.id) ?? current) : current,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        authService.logout();
        setAccount(null);
        return;
      }
      setDataError(errorText(e, 'Không tải được danh sách cửa. Kiểm tra kết nối rồi thử lại.'));
    } finally {
      setDataLoading(false);
    }
  };
  useEffect(() => {
    if (!authenticated) return;
    return subscribeUpdates(() => {
      void load(true);
    });
  }, [authenticated]);
  // Khôi phục phiên từ cookie khi mở/tải lại app, tránh phải đăng nhập lại
  useEffect(() => {
    void authService
      .me()
      .then(setAccount)
      .catch(() => undefined)
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    if (authenticated) void load();
  }, [authenticated]);
  // Tự cập nhật trạng thái cửa mỗi 10 giây, không cần tải lại trang
  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(() => {
      void load(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [authenticated]);
  if (booting) return <Splash />;
  if (!account)
    return <Auth registering={registering} setRegistering={setRegistering} onDone={setAccount} />;
  const openDoor = (door: Door) => {
    setSelected(door);
    setView('detail');
  };
  const logout = () => {
    authService.logout();
    setAccount(null);
    setView('home');
  };
  const body =
    view === 'home' ? (
      <Home
        loading={dataLoading}
        error={dataError}
        retry={() => {
          void load();
        }}
        add={() => setAddOpen(true)}
        notifications={() => setView('alerts')}
        doors={doors}
        onDoor={openDoor}
        onUnlock={setPinDoor}
      />
    ) : view === 'devices' ? (
      <Devices
        loading={dataLoading}
        error={dataError}
        retry={() => {
          void load();
        }}
        doors={doors}
        onDoor={openDoor}
        onAdd={() => setAddOpen(true)}
      />
    ) : view === 'invitations' ? (
      <RealInvitations changed={load} />
    ) : view === 'profile' ? (
      <Profile
        account={account}
        notifications={() => setView('alerts')}
        logout={logout}
        verify={() => setView('user-verification')}
        edit={() => setView('account')}
        password={() => setView('password')}
        settings={() => setView('account-settings')}
      />
    ) : view === 'detail' && selected ? (
      <Detail
        door={selected}
        back={() => setView('home')}
        unlock={() => setPinDoor(selected)}
        members={() => {
          void loadMembers(selected);
          setView('members');
        }}
        approvals={() => setView('approvals')}
        setupFace={() => {
          setVerificationDoorName(selected.name);
          setView('user-verification');
        }}
        history={() => setView('history')}
        settings={() => setView('settings')}
      />
    ) : view === 'members' && selected ? (
      <Members
        loading={membersLoading}
        loadError={membersError}
        people={members}
        unitId={backendUnitId(selected)}
        refresh={() => loadMembers(selected)}
        back={() => setView('detail')}
        add={() => setView('add-member')}
        select={(person) => {
          setSelectedPerson(person);
          setView('member-detail');
        }}
      />
    ) : view === 'add-member' ? (
      <AddMemberChoice
        back={() => setView('members')}
        chooseApp={() => setView('invite-member')}
        choosePerson={() => setView('new-person-member')}
      />
    ) : view === 'new-person-member' ? (
      <NewPersonMember
        unitId={backendUnitId(selected)}
        back={() => setView('add-member')}
        done={async (user) => {
          await Promise.all([load(), loadMembers(selected)]);
          setSelectedPerson(toPerson(user));
          setView('member-detail');
        }}
      />
    ) : view === 'invite-member' ? (
      <ExistingAppMember
        unitId={backendUnitId(selected)}
        back={() => setView('add-member')}
        done={async () => {
          await Promise.all([load(), loadMembers(selected)]);
          setView('members');
        }}
      />
    ) : view === 'user-verification' ? (
      <GlobalFaceRegistration
        doors={doors}
        back={() => {
          setVerificationDoorName(undefined);
          setView('profile');
        }}
      />
    ) : view === 'approvals' && selected ? (
      <FaceApprovals door={selected} back={() => setView('detail')} />
    ) : view === 'member-detail' && selectedPerson ? (
      <MemberDetail
        person={selectedPerson}
        unitId={backendUnitId(selected)}
        refresh={async () => {
          await Promise.all([load(), loadMembers(selected)]);
        }}
        back={() => setView('members')}
      />
    ) : view === 'account' ? (
      <PersonalInformation account={account} changed={setAccount} back={() => setView('profile')} />
    ) : view === 'password' ? (
      <ChangePassword back={() => setView('profile')} />
    ) : view === 'account-settings' ? (
      <AccountSettings logout={logout} back={() => setView('profile')} />
    ) : view === 'settings' && selected ? (
      <OwnerDeviceSettings unitId={Number(selected.id)} back={() => setView('detail')} />
    ) : view === 'alerts' ? (
      <Alerts back={() => setView('home')} />
    ) : (
      <AccessHistory doorId={selected?.id} back={() => setView('detail')} />
    );
  return (
    <Screen>
      {body}
      {(['home', 'devices', 'invitations', 'profile'] as ViewName[]).includes(view) && (
        <FloatingNav
          active={view as TabKey}
          onTab={(t) => setView(t)}
          onAdd={() => setAddOpen(true)}
        />
      )}
      <AddDevice open={addOpen} close={() => setAddOpen(false)} onCreated={load} />
      <PinModal door={pinDoor} close={() => setPinDoor(null)} />
    </Screen>
  );
}
function Splash() {
  return (
    <Screen>
      <View style={x.splash}>
        <Brand large />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      </View>
    </Screen>
  );
}
function Auth({
  registering,
  setRegistering,
  onDone,
}: {
  registering: boolean;
  setRegistering: (v: boolean) => void;
  onDone: (account: AccountDto) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const validate = () => {
    if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
    if (!registering) return email.trim() ? null : 'Vui lòng nhập email hoặc số điện thoại.';
    if (name.trim().length < 2) return 'Vui lòng nhập họ và tên.';
    if (!email.trim() && !phone.trim()) return 'Cần nhập email hoặc số điện thoại.';
    if (email.trim() && !email.includes('@')) return 'Email không hợp lệ.';
    if (phone.trim() && !/^\+?[0-9]{8,15}$/.test(phone.trim()))
      return 'Số điện thoại gồm 8–15 chữ số.';
    if (password !== confirm) return 'Mật khẩu xác nhận không khớp.';
    return null;
  };
  const submit = async () => {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (registering) await authService.register({ fullName: name, email, phone, password });
      onDone(await authService.login(registering ? email.trim() || phone.trim() : email, password));
    } catch (e) {
      setError(errorText(e, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <View style={x.authLayout}>
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={x.auth}
        >
          <View style={x.authInner}>
            <View style={x.authBrandRow}>
              <Brand large />
            </View>
            <Text style={x.authTitle}>{registering ? 'Đăng ký' : 'Đăng nhập'}</Text>
            {registering ? (
              <Input
                label="Họ và tên"
                value={name}
                onChangeText={setName}
                placeholder="Nhập họ và tên của bạn"
                autoComplete="name"
              />
            ) : null}
            <Input
              label={registering ? 'Email' : 'Email hoặc số điện thoại'}
              value={email}
              onChangeText={setEmail}
              placeholder={registering ? 'ten@example.com' : 'Nhập email hoặc số điện thoại'}
              keyboardType="email-address"
              autoComplete="username"
            />
            {registering ? (
              <Input
                label="Số điện thoại · không bắt buộc"
                value={phone}
                onChangeText={setPhone}
                placeholder="Nhập số điện thoại"
                keyboardType="phone-pad"
              />
            ) : null}
            <Input
              label="Mật khẩu"
              value={password}
              onChangeText={setPassword}
              placeholder="Ít nhất 8 ký tự"
              secureTextEntry={!show}
              autoComplete={registering ? 'new-password' : 'current-password'}
              onSubmitEditing={() => {
                if (!registering && !saving) void submit();
              }}
              trailing={
                <Pressable
                  onPress={() => setShow(!show)}
                  style={x.eye}
                  accessibilityRole="button"
                  accessibilityLabel={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {icon(show ? 'eye-off-outline' : 'eye-outline', colors.muted)}
                </Pressable>
              }
            />
            {registering ? (
              <Input
                label="Xác nhận mật khẩu"
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Nhập lại mật khẩu"
                secureTextEntry={!show}
              />
            ) : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button
              title={saving ? 'Đang xử lý…' : registering ? 'Tạo tài khoản' : 'Đăng nhập'}
              icon="arrow-forward-outline"
              loading={saving}
              onPress={() => {
                void submit();
              }}
            />
            {!registering ? (
              <Pressable
                onPress={() =>
                  setError(
                    'Để khôi phục mật khẩu, vui lòng liên hệ bộ phận hỗ trợ quản lý hệ thống.',
                  )
                }
                accessibilityRole="button"
                style={{ padding: 8 }}
              >
                <Text style={x.link}>Quên mật khẩu?</Text>
              </Pressable>
            ) : null}
            <View style={x.authSwitch}>
              <Text style={x.sub}>
                {registering ? 'Đã có tài khoản?' : 'Bạn chưa có tài khoản?'}
              </Text>
              <Pressable
                onPress={() => {
                  setError('');
                  setRegistering(!registering);
                }}
                accessibilityRole="button"
                style={{ padding: 8 }}
              >
                <Text style={x.link}>{registering ? 'Đăng nhập' : 'Đăng ký ngay'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}
type LoadProps = { loading: boolean; error: string; retry: () => void };
function Home({
  doors,
  onDoor,
  onUnlock,
  notifications,
  add,
  loading,
  error,
  retry,
}: {
  notifications: () => void;
  doors: Door[];
  onDoor: (d: Door) => void;
  onUnlock: (d: Door) => void;
  add: () => void;
} & LoadProps) {
  const { width } = useWindowDimensions();
  const online = doors.filter((d) => d.connectivity === 'ONLINE').length;
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      contentContainerStyle={x.page}
      keyboardShouldPersistTaps="handled"
    >
      <View style={x.row}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ alignSelf: 'flex-start' }}>
            <Brand />
          </View>
        </View>
        <Pressable
          onPress={notifications}
          style={x.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Xem cảnh báo"
        >
          {icon('notifications-outline', colors.text)}
        </Pressable>
      </View>
      <Card style={x.summary}>
        <View style={x.summaryStats}>
          <View style={{ gap: 3 }}>
            <Text style={x.big}>{loading ? '—' : String(doors.length).padStart(2, '0')}</Text>
            <Text style={x.summaryCaption}>Cửa của bạn</Text>
          </View>
          <View style={x.statDivider} />
          <View style={{ gap: 3 }}>
            <Text style={[x.big, { color: colors.success }]}>
              {loading ? '—' : String(online).padStart(2, '0')}
            </Text>
            <Text style={x.summaryCaption}>Đang trực tuyến</Text>
          </View>
        </View>
      </Card>
      <View style={x.row}>
        <Text style={[x.section, { flex: 1 }]}>
          Cửa của bạn <Text style={x.sub}>({doors.length})</Text>
        </Text>
        <Pressable accessibilityRole="button" onPress={add} style={{ padding: 8 }}>
          <Text style={x.link}>+ Thêm cửa</Text>
        </Pressable>
      </View>
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button title="Tải lại danh sách" variant="ghost" onPress={retry} />
        </>
      ) : null}
      {loading ? (
        <LoadingState label="Đang kết nối với cửa của bạn…" />
      ) : doors.length ? (
        <View style={x.doorGrid}>
          {
            <ItemList
              items={doors}
              resetKey={''}
              renderItem={(d) => (
                <View key={d.id} style={{ width: width >= 720 ? '48.6%' : '100%' }}>
                  <DoorCard door={d} onPress={() => onDoor(d)} onUnlock={() => onUnlock(d)} />
                </View>
              )}
            />
          }
        </View>
      ) : !error ? (
        <EmptyState
          icon="home-outline"
          title="Chưa có cửa"
          action={<Button title="Thiết lập cửa mới" icon="add-outline" onPress={add} />}
        />
      ) : null}
    </ScrollView>
  );
}
const latchLabel = (door: Door) =>
  door.latchReleased == null
    ? 'Chưa xác nhận trạng thái chốt'
    : door.latchReleased
      ? 'Thiết bị báo: chốt đang mở'
      : door.doorClosed === true ? 'Đã khóa: cửa đóng và servo hoàn tất lệnh khóa' : 'Chốt ở góc khóa; cánh cửa chưa đóng';
const physicalLabel = (door: Door) =>
  door.doorClosed == null
    ? 'Chưa có dữ liệu cảm biến'
    : door.doorClosed
      ? 'Cảm biến báo: cánh cửa đóng'
      : 'Cảm biến báo: cánh cửa mở';
function DoorCard({
  door,
  onPress,
  onUnlock,
}: {
  door: Door;
  onPress: () => void;
  onUnlock: () => void;
}) {
  const usable = canRemoteUnlock(door) || canRemoteLock(door);
  return (
    <Card style={x.door}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Xem ${door.name}`}
        style={{ gap: 15 }}
      >
        <View style={x.row}>
          <View style={x.doorIcon}>{icon('home-outline')}</View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={x.cardTitle}>{door.name}</Text>
            <Text style={x.caption}>
              {door.role === 'OWNER' ? 'Chủ cửa' : 'Thành viên được chia sẻ'}
            </Text>
          </View>
          {icon('chevron-forward-outline', colors.muted)}
        </View>
        <View style={x.doorStatus}>
          <Status online={door.connectivity === 'ONLINE'} />
          <Text style={x.caption}>{door.members} thành viên</Text>
        </View>
        <View style={x.doorMeta}>
          <Text style={x.sub}>{physicalLabel(door)}</Text>
          <Text style={x.caption}>{latchLabel(door)}</Text>
        </View>
      </Pressable>
      {usable ? (
        <Button title="Mở / khóa từ xa" icon="lock-closed-outline" onPress={onUnlock} />
      ) : (
        <View style={x.disabledMessage}>
          {icon(
            door.connectivity === 'OFFLINE' ? 'cloud-offline-outline' : 'shield-outline',
            colors.muted,
          )}
          <Text style={[x.caption, { flex: 1 }]}>
            {door.connectivity === 'OFFLINE'
              ? 'Thiết bị ngoại tuyến · chưa thể mở từ xa'
              : 'Bạn chưa được cấp quyền mở từ xa'}
          </Text>
        </View>
      )}
    </Card>
  );
}
function Devices({
  doors,
  onDoor,
  onAdd,
  loading,
  error,
  retry,
}: { doors: Door[]; onDoor: (d: Door) => void; onAdd: () => void } & LoadProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const owned = doors.filter(canManageDoor);
  const rows = owned.filter(
    (d) =>
      `${d.name} ${d.deviceUid ?? ''}`
        .toLocaleLowerCase('vi')
        .includes(query.toLocaleLowerCase('vi')) &&
      (filter === 'all' || d.connectivity === filter),
  );
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      contentContainerStyle={x.page}
      keyboardShouldPersistTaps="handled"
    >
      <PageHeader
        title="Thiết bị của tôi"
        action={
          <Pressable
            onPress={onAdd}
            style={x.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Thêm thiết bị"
          >
            {icon('add-outline')}
          </Pressable>
        }
      />
      <Input
        label="Tìm thiết bị"
        value={query}
        onChangeText={setQuery}
        placeholder="Tên cửa hoặc mã thiết bị"
      />
      <View style={x.filters}>
        {[
          ['all', 'Tất cả'],
          ['ONLINE', 'Trực tuyến'],
          ['OFFLINE', 'Ngoại tuyến'],
        ].map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setFilter(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === key }}
            style={[x.filterChip, filter === key && x.filterSelected]}
          >
            <Text style={filter === key ? x.filterActiveText : x.caption}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button title="Thử lại" onPress={retry} variant="ghost" />
        </>
      ) : null}
      {loading ? (
        <LoadingState />
      ) : (
        <ItemList
          items={rows}
          resetKey={`${query}:${filter}`}
          renderItem={(d) => (
            <Card key={d.id}>
              <View style={x.row}>
                <View style={x.doorIcon}>{icon('hardware-chip-outline')}</View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={x.cardTitle}>{d.name}</Text>
                  <Text style={x.caption}>{d.members} thành viên</Text>
                </View>
                <Status online={d.connectivity === 'ONLINE'} />
              </View>
              <Text style={x.caption}>Cập nhật: {d.lastUpdate}</Text>
              <Button
                title="Quản lý thiết bị"
                variant="ghost"
                icon="options-outline"
                onPress={() => onDoor(d)}
              />
            </Card>
          )}
        />
      )}
      {!loading && !error && !rows.length ? (
        <EmptyState
          icon="hardware-chip-outline"
          title={owned.length ? 'Không tìm thấy thiết bị' : 'Bạn chưa sở hữu cửa nào'}
          description={owned.length ? 'Thử tên khác hoặc thay đổi bộ lọc.' : undefined}
          action={
            !owned.length ? (
              <Button title="Thêm thiết bị" icon="add-outline" onPress={onAdd} />
            ) : undefined
          }
        />
      ) : null}
    </ScrollView>
  );
}
function Detail({
  door,
  back,
  unlock,
  members,
  approvals,
  setupFace,
  history,
  settings,
}: {
  door: Door;
  back: () => void;
  unlock: () => void;
  members: () => void;
  approvals: () => void;
  setupFace: () => void;
  history: () => void;
  settings: () => void;
}) {
  const owner = canManageDoor(door);
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={x.page}
    >
      <PageHeader back={back} title={door.name} />
      <Card style={x.hero}>
        <View style={x.heroHeading}>
          <View style={x.largeLock}>
            {icon(
              door.lockState === 'LOCKED'
                ? 'lock-closed-outline'
                : door.lockState === 'UNLOCKED'
                  ? 'lock-open-outline'
                  : 'help-outline',
              '#fff',
            )}
          </View>
          <View style={{ gap: 7, flex: 1 }}>
            <Text style={x.cardTitle}>Trạng thái thiết bị</Text>
            <Status online={door.connectivity === 'ONLINE'} />
          </View>
        </View>
        <View style={x.divider} />
        <View style={{ gap: 8 }}>
          <Text style={x.sub}>{physicalLabel(door)}</Text>
          <Text style={x.sub}>{latchLabel(door)}</Text>
          <Text style={x.caption}>Tín hiệu gần nhất: {door.lastUpdate}</Text>
        </View>
      </Card>
      {canRemoteUnlock(door) || canRemoteLock(door) ? (
        <Button title="Mở / khóa từ xa" icon="lock-closed-outline" onPress={unlock} />
      ) : (
        <Notice>
          {door.connectivity === 'OFFLINE'
            ? 'Cửa đang ngoại tuyến. Chờ thiết bị kết nối lại để gửi lệnh từ xa.'
            : 'Tài khoản của bạn chưa được cấp quyền mở cửa từ xa.'}
        </Notice>
      )}
      <Text style={x.caption}>
        Phản hồi lệnh chốt không thay thế việc kiểm tra trạng thái cơ khí của cửa.
      </Text>
      {owner ? (
        <>
          <Text style={x.section}>Quản lý cửa</Text>
          {door.activationState && door.activationState !== 'ACTIVE' ? <Button title="Tiếp tục thiết lập PIN và hiệu chỉnh" icon="construct-outline" onPress={settings} /> : null}
          <Menu icon="people-outline" label="Thành viên" onPress={members} />
          <Menu
            icon="shield-checkmark-outline"
            label="Duyệt đăng ký khuôn mặt"
            onPress={approvals}
          />
          <Menu icon="scan-outline" label="Khuôn mặt & xác thực" onPress={setupFace} />
          <Menu icon="time-outline" label="Lịch sử ra vào" onPress={history} />
          <Menu icon="settings-outline" label="Cài đặt thiết bị" onPress={settings} />
        </>
      ) : (
        <>
          <Card style={x.faceRequired}>
            <View style={x.row}>
              <View style={x.choiceIcon}>{icon('scan-outline')}</View>
              <View style={{ flex: 1 }}>
                <Text style={x.cardTitle}>Khuôn mặt của bạn</Text>
              </View>
            </View>
            <Button
              title="Thiết lập khuôn mặt"
              variant="ghost"
              icon="camera-outline"
              onPress={setupFace}
            />
          </Card>
          <Menu icon="time-outline" label="Lịch sử cá nhân tại cửa" onPress={history} />
        </>
      )}
    </ScrollView>
  );
}
function Members({
  people,
  unitId,
  refresh,
  back,
  add,
  select,
  loading,
  loadError,
}: {
  loading: boolean;
  loadError: string;
  people: Person[];
  unitId: number | null;
  refresh: () => Promise<void>;
  back: () => void;
  add: () => void;
  select: (person: Person) => void;
}) {
  const confirmAction = useConfirm();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const toggle = async (p: Person) => {
    if (!unitId || busy) return;
    const enabled = p.access !== 'ACTIVE';
    if (
      !(await confirmAction({
        title: enabled ? 'Cho phép ra vào?' : 'Tạm khóa thành viên?',
        message: `Thay đổi quyền của ${p.name} tại cửa này. Các cửa khác giữ quyền riêng của chúng.`,
        confirmLabel: enabled ? 'Cho phép' : 'Tạm khóa',
        destructive: !enabled,
      }))
    )
      return;
    setBusy(p.id);
    setError('');
    try {
      await managerService.setAccess(unitId, Number(p.id), enabled);
      await refresh();
    } catch (e) {
      setError(errorText(e, 'Không đổi được quyền.'));
    } finally {
      setBusy(null);
    }
  };
  const rows = people.filter((p) =>
    `${p.name} ${p.contact ?? ''} ${p.room ?? ''}`
      .toLocaleLowerCase('vi')
      .includes(query.toLocaleLowerCase('vi')),
  );
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      contentContainerStyle={x.page}
      keyboardShouldPersistTaps="handled"
    >
      <PageHeader
        back={back}
        title="Thành viên"
        description={`${people.length} thành viên`}
        action={
          <Pressable
            onPress={add}
            style={x.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Thêm thành viên"
          >
            {icon('person-add-outline')}
          </Pressable>
        }
      />
      <Input
        label="Tìm thành viên"
        value={query}
        onChangeText={setQuery}
        placeholder="Tên, liên hệ hoặc phòng"
      />
      {error || loadError ? (
        <>
          <Notice tone="error">{error || loadError}</Notice>
          <Button
            title="Tải lại thành viên"
            variant="ghost"
            onPress={() => {
              void refresh();
            }}
          />
        </>
      ) : null}
      {loading ? <LoadingState label="Đang tải thành viên…" /> : null}
      {
        <ItemList
          items={rows}
          resetKey={`${unitId}:${query}`}
          renderItem={(p) => (
            <Card key={p.id} style={x.member}>
              <Pressable
                onPress={() => select(p)}
                style={[x.row, { flex: 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`Quản lý ${p.name}`}
              >
                <View style={x.avatar}>
                  <Text style={x.avatarText}>{p.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={x.cardTitle}>{p.name}</Text>
                  <Text style={x.caption}>
                    {p.room ? `Phòng ${p.room} · ` : ''}
                    {p.hasAccount ? 'Đã sử dụng ứng dụng' : 'Chưa đăng nhập ứng dụng'}
                  </Text>
                  <Text style={x.caption}>
                    {p.methods.length ? p.methods.join(' · ') : 'Chưa có phương thức được cấp'}
                  </Text>
                  <Badge
                    label={p.access === 'ACTIVE' ? 'Đang cho phép' : 'Đang tạm khóa'}
                    tone={p.access === 'ACTIVE' ? 'success' : 'warning'}
                  />
                </View>
              </Pressable>
              <Switch
                accessibilityLabel={`Quyền ra vào của ${p.name}`}
                disabled={busy !== null}
                value={p.access === 'ACTIVE'}
                onValueChange={() => {
                  void toggle(p);
                }}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#fff"
              />
            </Card>
          )}
        />
      }
      {!loading && !loadError && !rows.length ? (
        <EmptyState
          icon="people-outline"
          title={people.length ? 'Không tìm thấy thành viên' : 'Cùng chia sẻ không gian'}
          description={
            people.length
              ? 'Thử từ khóa khác để tìm thành viên.'
              : 'Mời thành viên và cấp phương thức xác thực cho cửa này.'
          }
          action={!people.length ? <Button title="Thêm thành viên" onPress={add} /> : undefined}
        />
      ) : null}
    </ScrollView>
  );
}
function AddMemberChoice({
  back,
  chooseApp,
  choosePerson,
}: {
  back: () => void;
  chooseApp: () => void;
  choosePerson: () => void;
}) {
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={x.page}
    >
      <PageHeader back={back} title="Thêm thành viên" />
      <Pressable
        onPress={chooseApp}
        accessibilityRole="button"
        accessibilityLabel="Mời người đã có ứng dụng"
      >
        <Card style={x.choice}>
          <View style={x.choiceIcon}>{icon('phone-portrait-outline')}</View>
          <View style={{ flex: 1 }}>
            <Text style={x.cardTitle}>Đã có ứng dụng Smart Door</Text>
          </View>
          {icon('chevron-forward-outline', colors.muted)}
        </Card>
      </Pressable>
      <Pressable
        onPress={choosePerson}
        accessibilityRole="button"
        accessibilityLabel="Thêm người chưa có ứng dụng"
      >
        <Card style={x.choice}>
          <View style={x.choiceIcon}>{icon('person-outline')}</View>
          <View style={{ flex: 1 }}>
            <Text style={x.cardTitle}>Chưa có ứng dụng</Text>
            <Text style={x.sub}>Chỉ dùng vân tay hoặc thẻ tại cửa</Text>
          </View>
          {icon('chevron-forward-outline', colors.muted)}
        </Card>
      </Pressable>
    </ScrollView>
  );
}
function ExistingAppMember({
  unitId,
  back,
  done,
}: {
  unitId: number | null;
  back: () => void;
  done: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<UserSearchDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const lookup = async () => {
    if (!email.trim()) {
      setFeedback('Vui lòng nhập email tài khoản cần tìm.');
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      const [match] = await managerService.searchUsers(email);
      if (!match)
        setFeedback('Chưa có tài khoản với email này. Người nhận cần đăng ký ứng dụng trước.');
      setFound(match ?? null);
    } catch (e) {
      setFeedback(errorText(e, 'Không tìm được tài khoản. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!found || !unitId) return;
    setBusy(true);
    setFeedback('');
    try {
      await managerService.addUser(unitId, found.id);
      setSent(true);
      setFeedback(
        `Đã gửi lời mời đến ${found.displayName}. Người nhận cần chấp nhận trên app; sau đó bạn có thể cấp từng quyền.`,
      );
    } catch (e) {
      setFeedback(errorText(e, 'Không gửi được lời mời. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={x.page}
    >
      <PageHeader back={back} title="Mời vào cửa" />
      {feedback ? <Notice tone={sent ? 'success' : 'error'}>{feedback}</Notice> : null}
      <Input
        label="Email tài khoản"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setFound(null);
          setSent(false);
          setFeedback('');
        }}
        placeholder="email@example.com"
        keyboardType="email-address"
      />
      {!found ? (
        <Button
          title={busy ? 'Đang tìm...' : 'Tìm tài khoản'}
          variant="ghost"
          disabled={busy}
          onPress={() => {
            void lookup();
          }}
        />
      ) : (
        <Card style={x.accountFound}>
          <View style={x.avatar}>
            <Text style={x.avatarText}>{found.displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={x.cardTitle}>{found.displayName}</Text>
            <Text style={x.sub}>{found.email ?? `Mã tài khoản ${found.id}`}</Text>
            <Text
              style={[
                x.caption,
                { color: found.status === 'ACTIVE' ? colors.success : colors.error },
              ]}
            >
              {found.status === 'ACTIVE' ? 'Tài khoản đang hoạt động' : 'Tài khoản đã bị khóa'}
            </Text>
          </View>
          {icon('checkmark-circle', colors.success)}
        </Card>
      )}
      <Button
        title={busy && found ? 'Đang thêm...' : 'Gửi lời mời'}
        disabled={!found || found.status !== 'ACTIVE' || busy || sent}
        onPress={() => {
          void submit();
        }}
      />
      {sent ? (
        <Button
          title="Về danh sách thành viên"
          variant="ghost"
          onPress={() => {
            void done();
          }}
        />
      ) : null}
    </ScrollView>
  );
}
function MemberDetail({
  person,
  unitId,
  refresh,
  back,
}: {
  person: Person;
  unitId: number | null;
  refresh: () => Promise<void>;
  back: () => void;
}) {
  const [feedback, setFeedback] = useState<{ text: string; success: boolean; pending?: boolean }>();
  const userId = /^[1-9]\d*$/.test(person.id) ? Number(person.id) : null;
  const [removing, setRemoving] = useState(false);
  const confirmAction = useConfirm();
  const accessActive = person.access === 'ACTIVE';
  const toggleAccess = async () => {
    if (!unitId || !userId) return;
    if (
      !(await confirmAction({
        title: accessActive ? 'Tạm khóa thành viên?' : 'Cho phép ra vào?',
        message: `Thay đổi quyền của ${person.name} tại cửa hiện tại.`,
        destructive: accessActive,
      }))
    )
      return;
    try {
      await managerService.setAccess(unitId, userId, !accessActive);
      await refresh();
      back();
    } catch (e) {
      setFeedback({ text: errorText(e, 'Không đổi được quyền.'), success: false });
    }
  };
  const removeMessage = person.deletableAccount
    ? `Xóa ${person.name} khỏi cửa này? Người này chưa từng đăng nhập nên tài khoản cũng sẽ bị xóa (nếu không thuộc cửa nào khác). Thao tác này không thể hoàn tác.`
    : `Xóa ${person.name} cùng thẻ và vân tay tại cửa này? Quyền bị thu hồi ngay; chỉ hoàn tất sau khi chip xác nhận xóa dữ liệu. Thao tác này không thể hoàn tác.`;
  const remove = async () => {
    if (
      !unitId ||
      !userId ||
      !(await confirmAction({
        title: 'Xóa thành viên?',
        message: removeMessage,
        confirmLabel: 'Xóa thành viên',
        destructive: true,
      }))
    )
      return;
    try {
      setRemoving(true);
      const command = await managerService.removeUser(unitId, userId);
      await refresh();
      const result = await managerService.waitForCommand(command);
      await refresh();
      if (result.status === 'ACKNOWLEDGED') back();
      else setFeedback({ text: 'Đã thu hồi quyền. Đang chờ ESP32 xóa thẻ và mẫu vân tay; giữ cửa online để hệ thống tự gửi lại lệnh.', success: false, pending: true });
    } catch (e) {
      setFeedback({ text: errorText(e, 'Không xóa được thành viên.'), success: false });
    } finally { setRemoving(false); }
  };
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={x.page}
    >
      <PageHeader back={back} title="Chi tiết thành viên" />
      {feedback ? (
        <Notice tone={feedback.pending ? 'info' : feedback.success ? 'success' : 'error'}>{feedback.text}</Notice>
      ) : null}
      <Card style={x.profile}>
        <View style={x.profileAvatar}>
          <Text style={x.profileInitial}>{person.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={x.cardTitle}>{person.name}</Text>
          <Text style={x.sub}>
            {memberContactLabel(person)}
          </Text>
          {person.room ? <Text style={x.caption}>Phòng {person.room}</Text> : null}
        </View>
      </Card>
      <Card style={{ gap: 12 }}>
        <View style={x.row}>
          <View style={{ flex: 1 }}>
            <Text style={x.cardTitle}>Cho phép ra vào</Text>
          </View>
          <Switch
            value={accessActive}
            onValueChange={() => {
              void toggleAccess();
            }}
            disabled={removing || person.removalPending}
            accessibilityLabel="Cho phép ra vào cửa"
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
        <Text style={x.caption}>
          Quyền được lưu trên hệ thống. Thiết bị cần nhận đồng bộ để áp dụng khi hoạt động cục bộ.
        </Text>
      </Card>
      <Text style={x.section}>Xác thực</Text>
      {unitId && userId ? (
        <MemberPermissions
          unitId={unitId}
          userId={userId}
          methods={person.methods}
          changed={refresh}
          disabled={removing || person.removalPending}
        />
      ) : null}
      {unitId && userId && !person.removalPending ? (
        <MemberFacePanel
          key={`${unitId}-${userId}`}
          unitId={unitId}
          accountId={userId}
          name={person.name}
          allowed={person.methods.includes('Khuôn mặt')}
          onChanged={refresh}
        />
      ) : null}
      {unitId && userId && !person.removalPending ? <CredentialEnrollment unitId={unitId} userId={userId} changed={refresh} disabled={removing} /> : null}
      {person.removalPending ? <Notice tone="info">Đã thu hồi quyền. Chờ cửa online và xác nhận xóa thẻ/vân tay để hoàn tất xóa thành viên.</Notice> : null}
      <Button
        title={removing ? "Đang chờ cửa xác nhận xóa…" : person.removalPending ? "Kiểm tra hoàn tất xóa" : "Xóa thành viên"}
        disabled={removing}
        variant="danger"
        onPress={() => {
          void remove();
        }}
      />
    </ScrollView>
  );
}
function Profile({
  account,
  logout,
  verify,
  notifications,
  edit,
  password,
  settings,
}: {
  account: AccountDto;
  notifications: () => void;
  logout: () => void;
  verify: () => void;
  edit: () => void;
  password: () => void;
  settings: () => void;
}) {
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={x.page}
    >
      <PageHeader title="Cá nhân" />
      <Card style={x.profile}>
        <View style={x.profileAvatar}>
          <Text style={x.profileInitial}>
            {account.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={x.profileName}>{account.fullName}</Text>
          {account.email || account.phone ? (
            <Text style={x.sub}>{account.email || account.phone}</Text>
          ) : null}
        </View>
      </Card>
      <Text style={x.section}>Hồ sơ & bảo mật</Text>
      <Menu icon="person-outline" label="Thông tin cá nhân" onPress={edit} />
      <Menu icon="key-outline" label="Đổi mật khẩu" onPress={password} />
      <Menu icon="scan-outline" label="Phương thức xác thực của tôi" onPress={verify} />
      <Text style={x.section}>Tùy chọn</Text>
      <Menu icon="notifications-outline" label="Cảnh báo & thông báo" onPress={notifications} />
      <Menu icon="settings-outline" label="Cài đặt tài khoản" onPress={settings} />
      <SignOutButton logout={logout} />
    </ScrollView>
  );
}
function PinModal({ door, close }: { door: Door | null; close: () => void }) {
  const [state, setState] = useState<'IDLE' | 'VERIFYING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [error, setError] = useState('');
  const [action, setAction] = useState<'OPEN' | 'LOCK'>('OPEN');
  const [waitingForDoor, setWaitingForDoor] = useState(false);
  useEffect(() => {
    if (!door) {
      setState('IDLE');
      setError('');
      setWaitingForDoor(false);
    }
  }, [door]);
  const unitId = backendUnitId(door);
  const send = async (nextAction: 'OPEN' | 'LOCK') => {
    if (!unitId || !door || !(nextAction === 'LOCK' ? canRemoteLock(door) : canRemoteUnlock(door))) {
      setError('Bạn chưa có quyền hoặc thiết bị không sẵn sàng.');
      setState('FAILED');
      return;
    }
    setState('VERIFYING');
    setAction(nextAction); setWaitingForDoor(false);
    setError('');
    try {
      const result = await managerService.waitForCommand(await (nextAction === 'LOCK' ? managerService.remoteLock(unitId) : managerService.remoteUnlock(unitId)));
      if (result.status === 'ACKNOWLEDGED') { setWaitingForDoor(result.resultMessage === 'LOCK_WAITING_FOR_DOOR'); setState('SUCCESS'); }
      else {
        setError(commandMessage(result, ''));
        setState('FAILED');
      }
    } catch (e) {
      setError(errorText(e, 'Không gửi được lệnh.'));
      setState('FAILED');
    }
  };
  const message =
    state === 'SUCCESS'
      ? action === 'LOCK' ? waitingForDoor ? 'Đã nhận yêu cầu khóa. Đóng cánh cửa; thiết bị sẽ tự khóa khi cảm biến xác nhận cửa đóng ổn định.' : 'Thiết bị đã nhận lệnh khóa. Theo dõi trạng thái chốt và cánh cửa để xác nhận đã khóa.' : 'Thiết bị đã xác nhận lệnh nhả chốt. Servo sẽ tự trở về góc khóa theo thời gian và chế độ đã cài đặt.'
      : state === 'VERIFYING'
        ? 'Đang chờ thiết bị xác nhận...'
        : state === 'FAILED'
          ? error
          : 'Chọn mở hoặc khóa từ xa theo chế độ chủ cửa đã cài. Chỉ báo đã khóa khi cảm biến xác nhận đóng và servo hoàn tất lệnh.';
  return (
    <AppModal
      visible={!!door}
      title="Điều khiển cửa từ xa"
      onClose={() => {
        if (state !== 'VERIFYING') close();
      }}
    >
      <View style={x.unlockSymbol}>
        {icon(state === 'SUCCESS' ? 'checkmark-circle-outline' : 'lock-open-outline')}
      </View>
      <Text style={[x.cardTitle, { textAlign: 'center' }]}>{door?.name}</Text>
      <Text
        style={[
          x.caption,
          {
            textAlign: 'center',
            color:
              state === 'SUCCESS'
                ? colors.success
                : state === 'FAILED'
                  ? colors.error
                  : colors.muted,
          },
        ]}
      >
        {message}
      </Text>
      {state === 'SUCCESS' ? (
        <Button title="Đóng" onPress={close} />
      ) : (
        <View style={{ gap: 12 }}><Button
          title={state === 'VERIFYING' ? 'Đang xác nhận...' : 'Mở cửa'}
          onPress={() => {
            void send('OPEN');
          }}
          loading={state === 'VERIFYING'}
          disabled={state === 'VERIFYING' || !door || !canRemoteUnlock(door)}
        /><Button title={state === 'VERIFYING' && action === 'LOCK' ? 'Đang gửi lệnh khóa…' : 'Khóa cửa'} icon="lock-closed-outline" variant="ghost"
          disabled={state === 'VERIFYING' || !door || !canRemoteLock(door)} onPress={() => { void send('LOCK'); }} /></View>
      )}
    </AppModal>
  );
}
function Menu({
  icon: i,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={x.menu}>
        {icon(i)}
        <Text style={[x.cardTitle, { flex: 1 }]}>{label}</Text>
        {icon('chevron-forward-outline', colors.muted)}
      </Card>
    </Pressable>
  );
}
const x = StyleSheet.create({
  page: { padding: 20, gap: 20, paddingBottom: 150 },
  splash: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authLayout: { flex: 1, backgroundColor: colors.surface },
  auth: { padding: 24, paddingVertical: 40, flexGrow: 1, justifyContent: 'center' },
  authInner: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 20 },
  authBrandRow: { alignItems: 'center', marginBottom: 4 },
  authTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 42,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  authSwitch: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  title: { color: colors.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.7 },
  eyebrow: { color: colors.success, fontSize: 14, letterSpacing: 1.5, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  link: { color: colors.primary, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: {
    width: 45,
    height: 45,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { backgroundColor: colors.surface, gap: 20 },
  summaryStats: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  big: { color: colors.navy, fontSize: 32, fontWeight: '700', letterSpacing: -0.8 },
  summaryCaption: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  statDivider: { height: 48, width: 1, backgroundColor: colors.border },
  section: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 5,
  },
  doorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  door: { gap: 16 },
  doorIcon: {
    width: 44,
    height: 48,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  doorMeta: {
    gap: 5,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  disabledMessage: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 4 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700', lineHeight: 26 },
  hero: { gap: 18 },
  heroHeading: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  largeLock: {
    width: 62,
    height: 68,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.navy,
  },
  divider: { height: 1, backgroundColor: colors.border },
  faceRequired: { backgroundColor: colors.primarySoft, gap: 15 },
  menu: {
    borderRadius: 13,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  choiceIcon: {
    width: 47,
    height: 51,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountFound: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 44,
    height: 44,
    backgroundColor: colors.surface,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  avatar: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '800' },
  caption: { fontSize: 14, color: colors.muted, lineHeight: 21 },
  filters: { flexDirection: 'row', gap: 9, flexWrap: 'wrap' },
  filterChip: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterSelected: { backgroundColor: colors.primarySoft, borderColor: '#CBDEFF' },
  filterActiveText: { color: colors.primary, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    flexShrink: 0,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: { color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '700' },
  profileInitial: { color: '#fff', fontSize: 22, lineHeight: 28, fontWeight: '700' },
  unlockSymbol: {
    alignSelf: 'center',
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

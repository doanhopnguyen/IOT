import { ItemList } from './ItemList';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import type { Door } from '../models/domain';
import {
  faceRequestLabel,
  faceService,
  type FaceProfile,
  type FaceRequestDto,
} from '../services/api/faceService';
import { managerService } from '../services/api/managerService';
import { colors, radius } from '../theme/tokens';
import {
  AppModal,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
} from './ui';
import { useConfirm } from './ConfirmationProvider';
import { FaceCapture } from './FaceCapture';
import type { ImagePickerAsset } from 'expo-image-picker';
import { uploadFaceMedia } from '../services/api/faceMediaUpload';

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Không kết nối được hệ thống.';
const emptyProfile: FaceProfile = {
  hasTemplate: false,
  credentialId: null,
  model: null,
  previewImage: null,
};
const unfinished = (requests: FaceRequestDto[]) =>
  requests.some((item) => item.status === 'PENDING' || item.status === 'APPROVED');

function PendingNotice() {
  return (
    <Card>
      <Text style={s.caption}>
        Đã có yêu cầu chưa hoàn tất. Chờ chủ cửa duyệt hoặc hủy yêu cầu bên dưới trước khi quét mẫu
        mới.
      </Text>
    </Card>
  );
}

function useFaceData(unitId?: number, accountId?: number) {
  const [profile, setProfile] = useState<FaceProfile>(emptyProfile);
  const [requests, setRequests] = useState<FaceRequestDto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const [nextProfile, nextRequests] = await Promise.all([
      accountId !== undefined && unitId !== undefined
        ? faceService.memberProfile(unitId, accountId)
        : faceService.profile(),
      faceService.list(accountId === undefined ? undefined : unitId),
    ]);
    return {
      nextProfile,
      nextRequests:
        accountId === undefined
          ? nextRequests
          : nextRequests.filter((item) => item.accountId === accountId),
    };
  }, [unitId, accountId]);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await reload();
        if (active) {
          setProfile(data.nextProfile);
          setRequests(data.nextRequests);
          setError('');
        }
      } catch (e) {
        if (active) setError(message(e));
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(() => {
            void poll();
          }, 5000);
        }
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [reload, revision]);
  return { profile, requests, error, loading, refresh };
}

function EnrollmentForm({
  unitId,
  accountId,
  name,
  hasTemplate,
  onChanged,
}: {
  unitId: number;
  accountId?: number;
  name?: string;
  hasTemplate: boolean;
  onChanged: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [replace, setReplace] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const submit = async (asset: ImagePickerAsset) => {
    if (!consent) throw new Error('Cần đồng ý thu thập khuôn mặt trước khi gửi.');
    if (accountId !== undefined)
      throw new Error('Thành viên cần tự đăng ký hồ sơ trong tài khoản của mình.');
    await uploadFaceMedia(asset);
    const created = await faceService.requestAccess(unitId);
    setCaptureOpen(false);
    setConsent(false);
    setReplace(false);
    setNotice(
      `Đã gửi yêu cầu #${created.id}. Chủ cửa có thể xem ảnh thu nhỏ và duyệt quyền nhận diện tại cửa.`,
    );
    onChanged();
  };
  return (
    <Card style={s.stack}>
      <Text style={s.heading}>
        {accountId ? `Mẫu khuôn mặt của ${name}` : 'Mẫu khuôn mặt của bạn'}
      </Text>
      <Text style={s.caption}>
        Đăng ký một lần theo tài khoản. Camera chỉ nhận mẫu khi người này có quyền tại cửa tương
        ứng.
      </Text>
      {hasTemplate ? (
        <>
          <Text style={s.success}>Đã có mẫu; không cần đăng ký lại tại cửa khác.</Text>
          {accountId !== undefined ? (
            <Text style={s.caption}>
              Chỉ thành viên được yêu cầu thay mẫu của mình. Chủ cửa quản lý quyền tại cửa này.
            </Text>
          ) : (
            <View style={s.row}>
              <Switch disabled={captureOpen} value={replace} onValueChange={setReplace} />
              <Text style={[s.caption, s.flex]}>
                Yêu cầu thay mẫu toàn tài khoản. Mẫu cũ vẫn có hiệu lực cho tới khi mẫu mới được
                duyệt.
              </Text>
            </View>
          )}
        </>
      ) : null}
      {!hasTemplate || replace ? (
        <>
          <Text style={s.caption}>
            Chọn ảnh từ thư viện hoặc chụp ảnh. Chỉ chủ tài khoản được tải mẫu của mình.
          </Text>
          <View style={s.row}>
            <Switch
              accessibilityLabel="Đồng ý thu thập khuôn mặt"
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
              thumbColor="#fff"
              disabled={captureOpen}
              value={consent}
              onValueChange={setConsent}
            />
            <Text style={[s.caption, s.flex]}>
              {accountId
                ? `Tôi xác nhận ${name} đồng ý đăng ký mẫu khuôn mặt và đồng bộ đến các cửa được cấp quyền.`
                : 'Tôi đồng ý lưu hồ sơ và ảnh thu nhỏ để chủ cửa đối chiếu, duyệt quyền nhận diện tại các cửa được cấp phép.'}
            </Text>
          </View>
          {captureOpen ? (
            <FaceCapture onSubmit={submit} onCancel={() => setCaptureOpen(false)} />
          ) : (
            <Button
              title={hasTemplate ? 'Quét để thay mẫu' : 'Quét khuôn mặt trong app'}
              icon="camera-outline"
              disabled={!consent}
              onPress={() => {
                setNotice('');
                setCaptureOpen(true);
              }}
            />
          )}
        </>
      ) : null}
      {notice ? <Text style={s.success}>{notice}</Text> : null}
    </Card>
  );
}

function RequestCard({
  item,
  manager,
  onChanged,
  onInspect,
}: {
  item: FaceRequestDto;
  manager: boolean;
  onChanged: () => void;
  onInspect?: (item: FaceRequestDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={s.requestCard}>
      <View style={s.row}>
        <View style={s.avatarBadge}>
          <Text style={s.avatarText}>{item.accountName.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.heading}>
            {item.accountName} <Text style={s.reqId}>#{item.id}</Text>
          </Text>
          <Text style={s.caption}>
            {item.accountEmail ? `${item.accountEmail} · ` : ''}
            {item.unitName}
          </Text>
        </View>
        <Badge
          label={
            item.status === 'PENDING'
              ? 'Chờ duyệt'
              : item.status === 'COMPLETED'
                ? 'Đã duyệt'
                : item.status === 'REJECTED'
                  ? 'Từ chối'
                  : 'Cần cập nhật'
          }
          tone={
            item.status === 'REJECTED'
              ? 'error'
              : item.status === 'PENDING'
                ? 'warning'
                : 'success'
          }
        />
      </View>

      {item.previewImage ? (
        <Pressable
          onPress={() => onInspect?.(item)}
          accessibilityRole="button"
          accessibilityLabel={`Xem ảnh khuôn mặt của ${item.accountName}`}
          style={s.photoPreviewWrap}
        >
          <Image
            source={{ uri: item.previewImage }}
            style={s.photoPreviewImg}
            resizeMode="cover"
          />
          <View style={s.photoOverlayBar}>
            <View style={s.photoTagPill}>
              <Ionicons name="scan-outline" size={14} color="#fff" />
              <Text style={s.photoTagText} numberOfLines={1}>
                Ảnh mẫu AI
              </Text>
            </View>
            <View style={s.zoomPill}>
              <Ionicons name="expand-outline" size={14} color="#fff" />
              <Text style={s.photoTagText}>Phóng to</Text>
            </View>
          </View>
        </Pressable>
      ) : (
        <View style={s.noPhotoBox}>
          <View style={s.noPhotoIcon}>
            <Ionicons name="person-circle-outline" size={32} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.noPhotoTitle}>Chưa có ảnh xem trước</Text>
            <Text style={s.caption}>
              Yêu cầu này chưa có ảnh thu nhỏ để đối chiếu.
            </Text>
          </View>
        </View>
      )}

      <View style={s.metaRow}>
        <View style={s.row}>
          <Ionicons name="time-outline" size={15} color={colors.muted} />
          <Text style={s.metaText}>{new Date(item.requestedAt).toLocaleString('vi-VN')}</Text>
        </View>
        <Text style={s.metaStatusText}>{faceRequestLabel(item)}</Text>
      </View>

      {onInspect ? (
        <Button
          title="Xem ảnh & chi tiết mẫu khuôn mặt"
          icon="eye-outline"
          variant="ghost"
          onPress={() => onInspect(item)}
        />
      ) : null}

      {manager && item.status === 'PENDING' ? (
        <View style={s.row}>
          <View style={s.flex}>
            <Button
              title="Từ chối"
              icon="close-outline"
              variant="ghost"
              disabled={busy}
              onPress={() => {
                void act(() => faceService.decide(item.id, false));
              }}
            />
          </View>
          <View style={s.flex}>
            <Button
              title="Duyệt"
              icon="checkmark-outline"
              disabled={busy}
              onPress={() => {
                void act(() => faceService.decide(item.id, true));
              }}
            />
          </View>
        </View>
      ) : null}
      {item.status === 'PENDING' || item.status === 'APPROVED' ? (
        <Button
          title="Hủy yêu cầu"
          variant="ghost"
          disabled={busy}
          onPress={() => {
            void act(() => faceService.cancel(item.id));
          }}
        />
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Card>
  );
}

function FaceInspectModal({
  item,
  manager,
  onClose,
  onChanged,
}: {
  item: FaceRequestDto | null;
  manager: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!item) return null;

  const decide = async (approved: boolean) => {
    setBusy(true);
    setError('');
    try {
      await faceService.decide(item.id, approved);
      onChanged();
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      visible={!!item}
      title={`Ảnh khuôn mặt · ${item.accountName}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {item.previewImage ? (
        <View style={s.modalPhotoContainer}>
          <Image
            source={{ uri: item.previewImage }}
            style={s.modalPhoto}
            resizeMode="contain"
            accessibilityLabel={`Ảnh khuôn mặt chi tiết của ${item.accountName}`}
          />
        </View>
      ) : (
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Ionicons name="scan-circle-outline" size={56} color={colors.primary} />
          <Text style={s.heading}>Chưa có ảnh xem trước</Text>
          <Text style={[s.caption, { textAlign: 'center' }]}>
            Yêu cầu cũ có thể chưa đính kèm ảnh thu nhỏ. Người đăng ký có thể gửi ảnh mới để bạn đối chiếu.
          </Text>
        </Card>
      )}

      <Card style={{ gap: 10, padding: 16 }}>
        <View style={s.row}>
          <View style={s.avatarBadge}>
            <Text style={s.avatarText}>{item.accountName.trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={s.heading} numberOfLines={1}>
              {item.accountName} <Text style={s.reqId}>#{item.id}</Text>
            </Text>
            <Text style={s.caption} numberOfLines={1}>
              {item.accountEmail ?? `Mã tài khoản #${item.accountId}`} · {item.unitName}
            </Text>
          </View>
          <Badge
            label={
              item.status === 'PENDING'
                ? 'Chờ duyệt'
                : item.status === 'COMPLETED'
                  ? 'Đã duyệt'
                  : item.status === 'REJECTED'
                    ? 'Từ chối'
                    : 'Cần cập nhật'
            }
            tone={
              item.status === 'REJECTED'
                ? 'error'
                : item.status === 'PENDING'
                  ? 'warning'
                  : 'success'
            }
          />
        </View>
        <View style={s.checkRow}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={s.checkText}>Hồ sơ khuôn mặt đã được xử lý trên máy chủ</Text>
        </View>
        <View style={s.checkRow}>
          <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
          <Text style={s.checkText}>
            Chủ tài khoản đã xác nhận đồng ý sử dụng sinh trắc học tại cửa
          </Text>
        </View>
        <Text style={s.caption}>
          Thời gian gửi: {new Date(item.requestedAt).toLocaleString('vi-VN')}
        </Text>
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {manager && item.status === 'PENDING' ? (
        <View style={s.row}>
          <View style={s.flex}>
            <Button
              title="Từ chối mẫu"
              icon="close-circle-outline"
              variant="ghost"
              disabled={busy}
              onPress={() => {
                void decide(false);
              }}
            />
          </View>
          <View style={s.flex}>
            <Button
              title="Duyệt mẫu này"
              icon="checkmark-circle-outline"
              loading={busy}
              disabled={busy}
              onPress={() => {
                void decide(true);
              }}
            />
          </View>
        </View>
      ) : (
        <Button title="Đóng" variant="ghost" onPress={onClose} />
      )}
    </AppModal>
  );
}

export function FaceRegistration({
  doors,
  initialDoorName,
  back,
}: {
  doors: Door[];
  initialDoorName?: string;
  back: () => void;
}) {
  const [doorId, setDoorId] = useState(
    () => doors.find((door) => door.name === initialDoorName)?.id ?? doors[0]?.id ?? '',
  );
  const { profile, requests, error, loading, refresh } = useFaceData();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  const [inspectItem, setInspectItem] = useState<FaceRequestDto | null>(null);
  const revoke = async () => {
    setBusy(true);
    setRevokeError('');
    try {
      await faceService.revoke();
      setConfirmRevoke(false);
      refresh();
    } catch (e) {
      setRevokeError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader back={back} title="Thiết lập khuôn mặt" />
      {loading ? <LoadingState label="Đang tải trạng thái mẫu…" /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {profile.hasTemplate ? (
        <Card style={s.stack}>
          <Text style={s.success}>Mẫu khuôn mặt đang hoạt động</Text>
          <Text style={s.caption}>
            Được thêm vào cửa mới không cần chụp lại. Chủ cửa phải bật quyền khuôn mặt trước khi
            camera nhận mẫu.
          </Text>
          {!confirmRevoke ? (
            <Button
              title="Thu hồi mẫu toàn tài khoản"
              variant="ghost"
              onPress={() => setConfirmRevoke(true)}
            />
          ) : (
            <>
              <Text style={s.error}>
                Mọi cửa sẽ ngừng chấp nhận mẫu này. Bạn có thể đăng ký mẫu mới sau đó.
              </Text>
              <Button
                title={busy ? 'Đang thu hồi...' : 'Xác nhận thu hồi mẫu'}
                variant="danger"
                disabled={busy}
                onPress={() => {
                  void revoke();
                }}
              />
              <Button
                title="Hủy"
                variant="ghost"
                disabled={busy}
                onPress={() => setConfirmRevoke(false)}
              />
            </>
          )}
          {revokeError ? <Text style={s.error}>{revokeError}</Text> : null}
        </Card>
      ) : null}
      {doors.length ? (
        <>
          <Text style={s.heading}>Chọn chủ cửa tiếp nhận yêu cầu</Text>
          <ItemList
            items={doors}
            resetKey={''}
            renderItem={(door) => (
              <Pressable key={door.id} onPress={() => setDoorId(door.id)}>
                <Card style={[s.row, door.id === doorId && s.selected]}>
                  <Text style={[s.heading, s.flex]}>{door.name}</Text>
                  <Ionicons
                    name={door.id === doorId ? 'checkmark-circle' : 'ellipse-outline'}
                    size={23}
                    color={colors.primary}
                  />
                </Card>
              </Pressable>
            )}
          />
          {!loading && !error ? (
            unfinished(requests) ? (
              <PendingNotice />
            ) : (
              <EnrollmentForm
                key={doorId}
                unitId={Number(doorId)}
                hasTemplate={profile.hasTemplate}
                onChanged={refresh}
              />
            )
          ) : null}
        </>
      ) : (
        <Card>
          <Text style={s.caption}>
            Bạn cần thuộc một cửa để gửi yêu cầu đăng ký. Mẫu đã có vẫn được quản lý theo tài khoản.
          </Text>
        </Card>
      )}
      <Text style={s.heading}>Yêu cầu đã gửi</Text>
      {requests.length ? (
        <ItemList
          items={requests}
          resetKey={''}
          renderItem={(item) => (
            <RequestCard
              key={item.id}
              item={item}
              manager={false}
              onChanged={refresh}
              onInspect={setInspectItem}
            />
          )}
        />
      ) : (
        <Card>
          <Text style={s.caption}>Chưa có yêu cầu đăng ký.</Text>
        </Card>
      )}
      <FaceInspectModal
        item={inspectItem}
        manager={false}
        onClose={() => setInspectItem(null)}
        onChanged={refresh}
      />
    </ScrollView>
  );
}

export function FaceApprovals({ door, back }: { door: Door; back: () => void }) {
  const [requests, setRequests] = useState<FaceRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'REJECTED'>('ALL');
  const [inspectItem, setInspectItem] = useState<FaceRequestDto | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await faceService.list(Number(door.id));
        if (active) {
          setRequests(data);
          setError('');
          setLoading(false);
        }
      } catch (e) {
        if (active) setError(message(e));
      } finally {
        if (active)
          timer = setTimeout(() => {
            void poll();
          }, 5000);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [door.id, revision]);

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
  const approvedCount = requests.filter((r) => r.status === 'COMPLETED').length;
  const filtered = [...requests]
    .filter((r) => (filter === 'ALL' ? true : r.status === filter))
    .sort((a, b) => {
      const rank = (status: string) =>
        status === 'PENDING' ? 0 : status === 'COMPLETED' ? 1 : 2;
      return rank(a.status) - rank(b.status) || b.id - a.id;
    });

  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader
        back={back}
        title="Duyệt khuôn mặt"
        description={door.name}
      />

      <View style={s.summaryRow}>
        <Card style={s.summaryBox}>
          <Text style={[s.summaryValue, { color: colors.text }]}>{pendingCount}</Text>
          <Text style={s.summaryLabel}>Chờ duyệt</Text>
        </Card>
        <Card style={s.summaryBox}>
          <Text style={[s.summaryValue, { color: colors.primary }]}>{approvedCount}</Text>
          <Text style={s.summaryLabel}>Đã duyệt</Text>
        </Card>
        <Card style={s.summaryBox}>
          <Text style={[s.summaryValue, { color: colors.text }]}>{requests.length}</Text>
          <Text style={s.summaryLabel}>Tổng cộng</Text>
        </Card>
      </View>

      <View style={s.filterRow}>
        {(
          [
            ['ALL', 'Tất cả'],
            ['PENDING', 'Chờ duyệt'],
            ['COMPLETED', 'Đã duyệt'],
            ['REJECTED', 'Từ chối'],
          ] as const
        ).map(([key, label]) => {
          const active = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[s.filterPill, active && s.filterPillActive]}
            >
              <Text
                style={active ? s.filterPillTextActive : s.filterPillText}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading && !error ? (
        <LoadingState />
      ) : filtered.length ? (
        <ItemList
          items={filtered}
          resetKey={filter}
          renderItem={(item) => (
            <RequestCard
              key={item.id}
              item={item}
              manager
              onChanged={refresh}
              onInspect={setInspectItem}
            />
          )}
        />
      ) : error ? null : (
        <EmptyState
          icon="scan-outline"
          title="Chưa có yêu cầu khuôn mặt"
          description="Khi thành viên gửi ảnh đăng ký khuôn mặt, bạn có thể xem ảnh và duyệt tại đây."
        />
      )}

      <FaceInspectModal
        item={inspectItem}
        manager
        onClose={() => setInspectItem(null)}
        onChanged={refresh}
      />
    </ScrollView>
  );
}

export function MemberFacePanel({
  unitId,
  accountId,
  name,
  allowed,
  onChanged,
}: {
  unitId: number;
  accountId: number;
  name: string;
  allowed: boolean;
  onChanged: () => Promise<void>;
}) {
  const { profile, requests, error, loading, refresh } = useFaceData(unitId, accountId);
  const confirmAction = useConfirm();
  const [enabled, setEnabled] = useState(allowed);
  const [saving, setSaving] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [inspectItem, setInspectItem] = useState<FaceRequestDto | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => setEnabled(allowed), [allowed]);
  const toggle = async (value: boolean) => {
    if (
      !(await confirmAction({
        title: value ? 'Cấp quyền khuôn mặt?' : 'Tắt quyền khuôn mặt?',
        message: `Thay đổi quyền của ${name} tại cửa này. Quyền ở các cửa khác không thay đổi.`,
        confirmLabel: 'Lưu quyền',
        destructive: !value,
      }))
    )
      return;
    setSaving(true);
    setPermissionError('');
    try {
      await managerService.setFaceAccess(unitId, accountId, value);
      setEnabled(value);
      await onChanged();
      refresh();
    } catch (e) {
      setPermissionError(message(e));
    } finally {
      setSaving(false);
    }
  };
  const previewUri =
    profile.previewImage ?? requests.find((r) => r.previewImage)?.previewImage ?? null;

  return (
    <View style={s.stack}>
      <Card style={s.stack}>
        <View style={s.row}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="scan-outline" size={20} color={colors.primary} />
          </View>
          <View style={s.flex}>
            <Text style={s.heading}>Cho phép khuôn mặt tại cửa này</Text>
            <Text style={s.caption}>Đồng bộ mẫu nhận diện với Camera AI của cửa</Text>
          </View>
          <Switch
            accessibilityLabel="Cho phép khuôn mặt"
            disabled={saving}
            value={enabled}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            thumbColor="#fff"
            onValueChange={(value) => {
              void toggle(value);
            }}
          />
        </View>
        {loading ? (
          <LoadingState label="Đang tải trạng thái mẫu…" />
        ) : (
          <Text style={profile.hasTemplate ? s.success : s.caption}>
            {profile.hasTemplate
              ? 'Đã có mẫu dùng chung. Camera của cửa này sẽ nhận mẫu khi được cấp quyền.'
              : 'Chưa có mẫu khuôn mặt đang hoạt động.'}
          </Text>
        )}
        {previewUri ? (
          <Pressable
            onPress={() => setPreviewOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Xem ảnh khuôn mặt của ${name}`}
            style={s.photoPreviewWrap}
          >
            <Image source={{ uri: previewUri }} style={s.photoPreviewImg} resizeMode="cover" />
            <View style={s.photoOverlayBar}>
              <View style={s.photoTagPill}>
                <Ionicons name="person-circle-outline" size={14} color="#fff" />
                <Text style={s.photoTagText} numberOfLines={1}>
                  Ảnh mẫu · {name}
                </Text>
              </View>
              <View style={s.zoomPill}>
                <Ionicons name="expand-outline" size={14} color="#fff" />
                <Text style={s.photoTagText}>Phóng to</Text>
              </View>
            </View>
          </Pressable>
        ) : null}
        {error || permissionError ? (
          <Text accessibilityRole="alert" style={s.error}>
            {permissionError || error}
          </Text>
        ) : null}
      </Card>
      <ItemList
        items={requests}
        resetKey={''}
        renderItem={(item) => (
          <RequestCard
            key={item.id}
            item={item}
            manager
            onChanged={refresh}
            onInspect={setInspectItem}
          />
        )}
      />
      <FaceInspectModal
        item={inspectItem}
        manager
        onClose={() => setInspectItem(null)}
        onChanged={refresh}
      />
      <AppModal
        visible={previewOpen && !!previewUri}
        title={`Ảnh khuôn mặt · ${name}`}
        onClose={() => setPreviewOpen(false)}
      >
        {previewUri ? (
          <View style={s.modalPhotoContainer}>
            <Image source={{ uri: previewUri }} style={s.modalPhoto} resizeMode="contain" />
          </View>
        ) : null}
        <Button title="Đóng" variant="ghost" onPress={() => setPreviewOpen(false)} />
      </AppModal>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 18, paddingBottom: 150 },
  stack: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: 28, lineHeight: 36, fontWeight: '700' },
  heading: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  reqId: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  caption: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  error: { color: colors.error, lineHeight: 20 },
  success: { color: colors.success, lineHeight: 20, fontWeight: '600' },
  back: { width: 48, height: 48, justifyContent: 'center' },
  selected: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryBox: {
    flex: 1,
    padding: 13,
    borderRadius: 20,
    gap: 2,
    alignItems: 'center',
  },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPill: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: colors.primary,
  },
  filterPillText: { fontSize: 12.5, fontWeight: '600', color: colors.muted },
  filterPillTextActive: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
  requestCard: { gap: 14 },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontSize: 17, fontWeight: '800' },
  photoPreviewWrap: {
    width: '100%',
    height: 210,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.navy,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoPreviewImg: {
    width: '100%',
    height: '100%',
  },
  photoOverlayBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  photoTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
  },
  zoomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
  },
  photoTagText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  noPhotoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noPhotoIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: { fontSize: 13, color: colors.muted },
  metaStatusText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  modalPhotoContainer: {
    width: '100%',
    height: 225,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalPhoto: { width: '100%', height: '100%' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { fontSize: 13, color: colors.text, fontWeight: '600', flex: 1 },
});

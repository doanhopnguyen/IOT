import { ItemList } from './ItemList';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AppModal,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  styles as s,
} from './ui';
import { useConfirm } from './ConfirmationProvider';
import { FaceCapture } from './FaceCapture';
import { uploadFaceMedia } from '../services/api/faceMediaUpload';
import {
  faceService,
  faceRequestLabel,
  type FaceProfile,
  type FaceRequestDto,
} from '../services/api/faceService';
import type { Door } from '../models/domain';
import { colors, radius } from '../theme/tokens';

export function GlobalFaceRegistration({ doors, back }: { doors: Door[]; back: () => void }) {
  const confirmAction = useConfirm();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<FaceProfile>();
  const [requests, setRequests] = useState<FaceRequestDto[]>([]);
  const [capture, setCapture] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = async () => {
    const [p, r] = await Promise.all([faceService.profile(), faceService.list()]);
    setProfile(p);
    setRequests(r);
    setError('');
  };
  useEffect(() => {
    void reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thực hiện được.');
    } finally {
      setBusy(false);
    }
  };
  const previewImage =
    profile?.previewImage ?? requests.find((r) => r.previewImage)?.previewImage ?? null;

  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader
        back={back}
        title="Khuôn mặt của tôi"
        description="Hồ sơ sinh trắc học dùng chung cho các cửa được cấp quyền"
        eyebrow="SINH TRẮC HỌC AI"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <LoadingState label="Đang tải hồ sơ khuôn mặt…" /> : null}
      <Card>
        <View style={s.row}>
          <View style={gStyles.iconBadge}>
            <Ionicons name="scan-outline" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.heading}>Hồ sơ xác thực khuôn mặt</Text>
            <Text style={s.caption}>Trích xuất đặc trưng ArcFace 512 chiều</Text>
          </View>
          <Badge
            label={profile?.hasTemplate ? 'Đã có mẫu' : loading ? 'Đang tải' : 'Chưa đăng ký'}
            tone={profile?.hasTemplate ? 'success' : 'neutral'}
          />
        </View>

        {previewImage && !capture ? (
          <Pressable
            onPress={() => setPreviewOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Xem ảnh khuôn mặt đã đăng ký"
            style={gStyles.photoBox}
          >
            <Image source={{ uri: previewImage }} style={gStyles.photoImg} resizeMode="cover" />
            <View style={gStyles.photoOverlay}>
              <View style={gStyles.photoPill}>
                <Ionicons name="checkmark-circle" size={14} color="#34D399" />
                <Text style={gStyles.photoPillText}>Ảnh mẫu đang hoạt động</Text>
              </View>
              <View style={[gStyles.photoPill, { backgroundColor: 'rgba(37,99,235,0.88)' }]}>
                <Ionicons name="expand-outline" size={14} color="#fff" />
                <Text style={gStyles.photoPillText}>Xem ảnh lớn</Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {capture ? (
          <FaceCapture
            onCancel={() => setCapture(false)}
            onSubmit={async (asset) => {
              await uploadFaceMedia(asset);
              setCapture(false);
              await reload();
            }}
          />
        ) : (
          <Button
            title={
              profile?.hasTemplate
                ? 'Thay ảnh — các cửa cần duyệt lại'
                : 'Đăng ký bằng ảnh hoặc camera'
            }
            icon="camera-outline"
            disabled={loading || !!error}
            onPress={() => {
              if (!profile?.hasTemplate) setCapture(true);
              else
                void confirmAction({
                  title: 'Thay hồ sơ khuôn mặt?',
                  message: 'Sau khi thay hồ sơ, các cửa cần duyệt lại quyền sử dụng mẫu mới.',
                  confirmLabel: 'Tiếp tục',
                }).then((ok) => {
                  if (ok) setCapture(true);
                });
            }}
          />
        )}
        {profile?.hasTemplate ? (
          <Button
            title="Xóa hồ sơ trên toàn tài khoản"
            variant="danger"
            icon="trash-outline"
            disabled={busy}
            onPress={() => {
              void confirmAction({
                title: 'Xóa hồ sơ toàn tài khoản?',
                message: 'Mọi cửa sẽ ngừng sử dụng mẫu này. Bạn có thể đăng ký mẫu mới sau đó.',
                confirmLabel: 'Xóa hồ sơ',
                destructive: true,
              }).then((ok) => {
                if (ok) void act(() => faceService.revoke());
              });
            }}
          />
        ) : null}
      </Card>
      <Text style={s.heading}>Quyền sử dụng tại cửa</Text>
      <ItemList
        items={doors}
        resetKey={''}
        renderItem={(d) => {
          const rows = requests.filter((r) => r.unitId === Number(d.id));
          const pending = rows.find((r) => r.status === 'PENDING');
          return (
            <Card key={d.id}>
              <View style={s.row}>
                <View style={gStyles.doorSmallIcon}>
                  <Ionicons name="home-outline" size={20} color={colors.indigo} />
                </View>
                <Text style={[s.heading, { flex: 1 }]}>{d.name}</Text>
                <Badge label={d.role === 'OWNER' ? 'Chủ cửa' : 'Thành viên'} tone="primary" />
              </View>
              {rows.slice(0, 3).map((r) => (
                <View key={r.id} style={gStyles.reqStatusLine}>
                  <Ionicons
                    name={
                      r.status === 'COMPLETED'
                        ? 'checkmark-circle'
                        : r.status === 'PENDING'
                          ? 'time'
                          : 'close-circle'
                    }
                    size={17}
                    color={
                      r.status === 'COMPLETED'
                        ? colors.success
                        : r.status === 'PENDING'
                          ? colors.warning
                          : colors.error
                    }
                  />
                  <Text style={[s.description, { fontSize: 14, flex: 1 }]}>
                    {faceRequestLabel(r)}
                  </Text>
                </View>
              ))}
              <Button
                title={pending ? 'Hủy yêu cầu đang chờ' : 'Gửi yêu cầu dùng hồ sơ đã đăng ký'}
                icon={pending ? 'close-outline' : 'paper-plane-outline'}
                variant={pending ? 'ghost' : 'primary'}
                disabled={busy || !profile?.hasTemplate}
                onPress={() => {
                  void act(() =>
                    pending
                      ? faceService.cancel(pending.id)
                      : faceService.requestAccess(Number(d.id)),
                  );
                }}
              />
            </Card>
          );
        }}
      />
      {!doors.length ? (
        <EmptyState icon="scan-outline" title="Chưa có cửa để gửi yêu cầu" />
      ) : null}

      <AppModal
        visible={previewOpen && !!previewImage}
        title="Ảnh khuôn mặt của tôi"
        onClose={() => setPreviewOpen(false)}
      >
        {previewImage ? (
          <View style={gStyles.modalPhotoWrap}>
            <Image source={{ uri: previewImage }} style={gStyles.photoImg} resizeMode="contain" />
          </View>
        ) : null}
        <Button title="Đóng" variant="ghost" onPress={() => setPreviewOpen(false)} />
      </AppModal>
    </ScrollView>
  );
}

const gStyles = StyleSheet.create({
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorSmallIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.indigoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqStatusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  photoBox: {
    width: '100%',
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.navy,
    position: 'relative',
  },
  photoImg: { width: '100%', height: '100%' },
  photoOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,42,0.75)',
  },
  photoPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalPhotoWrap: {
    width: '100%',
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.navy,
  },
});

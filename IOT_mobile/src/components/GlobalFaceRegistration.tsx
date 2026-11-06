import { ItemList } from './ItemList';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
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

export function GlobalFaceRegistration({ doors, back }: { doors: Door[]; back: () => void }) {
  const confirmAction = useConfirm();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<FaceProfile>();
  const [requests, setRequests] = useState<FaceRequestDto[]>([]);
  const [capture, setCapture] = useState(false);
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
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader back={back} title="Khuôn mặt của tôi" />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <LoadingState label="Đang tải hồ sơ khuôn mặt…" /> : null}
      <Card>
        <Text style={s.heading}>Hồ sơ xác thực</Text>
        <Badge
          label={profile?.hasTemplate ? 'Đã có mẫu' : loading ? 'Đang tải' : 'Chưa đăng ký'}
          tone={profile?.hasTemplate ? 'success' : 'neutral'}
        />
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
                ? 'Thay ảnh/video — các cửa cần duyệt lại'
                : 'Đăng ký bằng ảnh / video / camera'
            }
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
      {
        <ItemList
          items={doors}
          resetKey={''}
          renderItem={(d) => {
            const rows = requests.filter((r) => r.unitId === Number(d.id));
            const pending = rows.find((r) => r.status === 'PENDING');
            return (
              <Card key={d.id}>
                <View style={s.row}>
                  <Text style={[s.heading, { flex: 1 }]}>{d.name}</Text>
                  <Badge label={d.role === 'OWNER' ? 'Chủ cửa' : 'Thành viên'} tone="primary" />
                </View>
                {rows.slice(0, 3).map((r) => (
                  <Text style={s.description} key={r.id}>
                    {faceRequestLabel(r)}
                  </Text>
                ))}
                <Button
                  title={pending ? 'Hủy yêu cầu đang chờ' : 'Gửi yêu cầu dùng hồ sơ đã đăng ký'}
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
      }
      {!doors.length ? <EmptyState icon="scan-outline" title="Chưa có cửa để gửi yêu cầu" /> : null}
    </ScrollView>
  );
}

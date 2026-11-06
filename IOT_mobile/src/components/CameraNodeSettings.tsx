import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { request, getApiBaseUrl } from '../services/api/client';
import { Badge, Button, Card, Input, Notice, styles as s } from './ui';
import { useConfirm } from './ConfirmationProvider';

export function CameraNodeSettings({ unitId }: { unitId: number }) {
  const confirm = useConfirm();
  const [nodes, setNodes] = useState<{ deviceCode: string; lifecycleStatus: string }[]>([]);
  const [password, setPassword] = useState('');
  const [issued, setIssued] = useState('');
  const [showIssued, setShowIssued] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const path = `/api/manager/units/${unitId}/camera-node`;
  useEffect(() => {
    let active = true;
    void request<typeof nodes>(path)
      .then((r) => {
        if (active) setNodes(r);
      })
      .catch((e) => {
        if (active) {
          setFailed(true);
          setMessage(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);
  const act = async (uid?: string) => {
    if (
      uid &&
      !(await confirm({
        title: 'Gỡ camera khỏi cửa?',
        message: 'Khóa cấp cho camera này sẽ bị vô hiệu. Camera sẽ ngừng nhận hồ sơ từ cửa.',
        confirmLabel: 'Gỡ camera',
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      if (uid) {
        await request(`${path}/${uid}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        setIssued('');
      } else {
        const result = await request<{ deviceUid: string; deviceSecret: string }>(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        setIssued(
          `FACE_API_URL=${getApiBaseUrl()}\nFACE_DEVICE_UID=${result.deviceUid}\nFACE_DEVICE_SECRET=${result.deviceSecret}`,
        );
        setShowIssued(false);
      }
      setNodes(await request(path));
      setPassword('');
      setMessage(
        uid
          ? 'Đã gỡ camera và vô hiệu khóa cũ.'
          : 'Đã cấp camera. Lưu thông tin riêng trước khi rời màn hình.',
      );
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Text style={s.heading}>Camera nhận diện</Text>
      {loading ? <Text style={s.caption}>Đang tải camera…</Text> : null}
      {nodes.map((n) => (
        <Card key={n.deviceCode}>
          <Text selectable style={s.description}>
            {n.deviceCode}
          </Text>
          <Badge
            label={
              n.lifecycleStatus === 'ACTIVE'
                ? 'Đang hoạt động'
                : n.lifecycleStatus === 'PROVISIONED'
                  ? 'Đã cấp phát'
                  : n.lifecycleStatus
            }
            tone={n.lifecycleStatus === 'ACTIVE' ? 'success' : 'neutral'}
          />
          <Button
            title="Gỡ camera"
            variant="ghost"
            disabled={busy || !password}
            onPress={() => {
              void act(n.deviceCode);
            }}
          />
        </Card>
      ))}
      <Input
        label="Mật khẩu tài khoản hiện tại"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Xác thực để cấp / gỡ camera"
      />
      {!loading && !nodes.length ? (
        <Button
          title="Cấp camera mới"
          icon="videocam-outline"
          disabled={busy || !password}
          loading={busy}
          onPress={() => {
            void act();
          }}
        />
      ) : null}
      {issued ? (
        <>
          <Notice tone="warning">
            Thông tin riêng chỉ hiện một lần. Lưu vào cấu hình camera và giữ ở nơi riêng tư.
          </Notice>
          <Button
            title={showIssued ? 'Ẩn thông tin cấp phát' : 'Hiện thông tin cấp phát'}
            variant="ghost"
            onPress={() => setShowIssued((value) => !value)}
          />
          {showIssued ? (
            <Text selectable style={[s.caption, { fontFamily: 'monospace' }]}>
              {issued}
            </Text>
          ) : null}
        </>
      ) : null}
      {message ? <Notice tone={failed ? 'error' : 'success'}>{message}</Notice> : null}
    </Card>
  );
}

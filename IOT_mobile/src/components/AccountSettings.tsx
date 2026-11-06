import { ReactNode, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Button, Card, Input, Notice, PageHeader, styles as s } from './ui';
import { useConfirm } from './ConfirmationProvider';
import { request } from '../services/api/client';
import type { AccountDto } from '../services/api/authService';

type Feedback = { text: string; error: boolean };
function useAccountAction() {
  const [feedback, setFeedback] = useState<Feedback>();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setFeedback(undefined);
    try {
      setFeedback({ text: await fn(), error: false });
    } catch (e) {
      setFeedback({
        text: e instanceof Error ? e.message : 'Không thực hiện được. Vui lòng thử lại.',
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };
  return { feedback, busy, act };
}
function AccountPage({
  title,
  back,
  feedback,
  children,
}: {
  title: string;
  back: () => void;
  feedback?: Feedback;
  children: ReactNode;
}) {
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader back={back} title={title} />
      {feedback ? (
        <Notice tone={feedback.error ? 'error' : 'success'}>{feedback.text}</Notice>
      ) : null}
      {children}
    </ScrollView>
  );
}
export function PersonalInformation({
  account,
  changed,
  back,
}: {
  account: AccountDto;
  changed: (a: AccountDto) => void;
  back: () => void;
}) {
  const [name, setName] = useState(account.fullName),
    [email, setEmail] = useState(account.email ?? ''),
    [phone, setPhone] = useState(account.phone ?? '');
  const { feedback, busy, act } = useAccountAction();
  return (
    <AccountPage title="Thông tin cá nhân" back={back} feedback={feedback}>
      <Card>
        <Input
          label="Họ và tên"
          value={name}
          onChangeText={setName}
          placeholder="Nhập họ và tên"
          autoComplete="name"
        />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="ten@example.com"
          keyboardType="email-address"
        />
        <Input
          label="Số điện thoại"
          value={phone}
          onChangeText={setPhone}
          placeholder="Nhập số điện thoại"
          keyboardType="phone-pad"
        />
        <Button
          title={busy ? 'Đang lưu…' : 'Lưu hồ sơ'}
          icon="checkmark-outline"
          disabled={busy || name.trim().length < 2}
          onPress={() => {
            void act(async () => {
              const updated = await request<AccountDto>('/api/accounts/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fullName: name,
                  email: email || null,
                  phone: phone || null,
                }),
              });
              changed(updated);
              return 'Thông tin cá nhân đã được cập nhật.';
            });
          }}
        />
      </Card>
    </AccountPage>
  );
}
export function ChangePassword({ back }: { back: () => void }) {
  const confirm = useConfirm();
  const [oldPassword, setOld] = useState(''),
    [newPassword, setNew] = useState(''),
    [confirmPassword, setConfirm] = useState('');
  const { feedback, busy, act } = useAccountAction();
  return (
    <AccountPage title="Đổi mật khẩu" back={back} feedback={feedback}>
      <Card>
        <Text style={s.description}>
          Sau khi đổi mật khẩu, các phiên cũ sẽ bị thu hồi và bạn cần đăng nhập lại.
        </Text>
        <Input
          label="Mật khẩu hiện tại"
          value={oldPassword}
          onChangeText={setOld}
          placeholder="Nhập mật khẩu hiện tại"
          secureTextEntry
          autoComplete="current-password"
        />
        <Input
          label="Mật khẩu mới"
          value={newPassword}
          onChangeText={setNew}
          placeholder="Ít nhất 8 ký tự"
          secureTextEntry
          autoComplete="new-password"
        />
        <Input
          label="Xác nhận mật khẩu mới"
          value={confirmPassword}
          onChangeText={setConfirm}
          placeholder="Nhập lại mật khẩu mới"
          secureTextEntry
          error={
            confirmPassword && newPassword !== confirmPassword
              ? 'Mật khẩu xác nhận chưa khớp.'
              : undefined
          }
        />
        <Button
          title="Đổi mật khẩu"
          icon="key-outline"
          disabled={
            busy || !oldPassword || newPassword.length < 8 || newPassword !== confirmPassword
          }
          onPress={() => {
            void confirm({
              title: 'Đổi mật khẩu?',
              message: 'Bạn sẽ cần đăng nhập lại trên các thiết bị sau khi thay đổi.',
              confirmLabel: 'Đổi mật khẩu',
            }).then((ok) => {
              if (ok)
                void act(async () => {
                  await request('/api/accounts/me/password', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      currentPassword: oldPassword,
                      newPassword,
                      confirmPassword,
                    }),
                  });
                  setOld('');
                  setNew('');
                  setConfirm('');
                  return 'Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.';
                });
            });
          }}
        />
      </Card>
    </AccountPage>
  );
}
export function AccountSettings({ back, logout }: { back: () => void; logout: () => void }) {
  return (
    <AccountPage title="Cài đặt tài khoản" back={back}>
      <Card>
        <Text style={s.heading}>Phiên đăng nhập</Text>
        <SignOutButton logout={logout} />
      </Card>
    </AccountPage>
  );
}
export function SignOutButton({ logout }: { logout: () => void }) {
  const confirm = useConfirm();
  return (
    <Button
      title="Đăng xuất"
      variant="ghost"
      icon="log-out-outline"
      onPress={() => {
        void confirm({
          title: 'Đăng xuất tài khoản?',
          message: 'Bạn có thể đăng nhập lại bất kỳ lúc nào để tiếp tục quản lý cửa.',
          confirmLabel: 'Đăng xuất',
        }).then((accepted) => {
          if (accepted) logout();
        });
      }}
    />
  );
}

import { useState } from 'react';
import { ScrollView } from 'react-native';
import { managerService, UnitUserDto } from '../services/api/managerService';
import { validateMemberProfileInput } from '../utils/memberProfileInput';
import { Button, Input, Notice, PageHeader, styles as s } from './ui';

/** Thêm người chưa có tài khoản: hồ sơ chỉ dùng tại cửa, không đăng nhập ứng dụng. */
export function NewPersonMember({
  unitId,
  back,
  done,
}: {
  unitId: number | null;
  back: () => void;
  done: (user: UnitUserDto) => Promise<void>;
}) {
  const [fullName, setFullName] = useState('');
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!unitId || busy) return;
    const checked = validateMemberProfileInput({ fullName, room });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const user = await managerService.createMemberProfile(unitId, checked.value);
      await done(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được hồ sơ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
      <PageHeader back={back} title="Người chưa có ứng dụng" />
      <Notice>
        Tạo hồ sơ chỉ dùng tại cửa. Người này không đăng nhập ứng dụng; sau khi tạo, bạn thêm vân tay hoặc gán
        thẻ cho họ.
      </Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Input
        label="Họ và tên"
        value={fullName}
        onChangeText={(value) => {
          setFullName(value);
          setError('');
        }}
        placeholder="Nguyễn Văn A"
        maxLength={100}
        autoCapitalize="words"
      />
      <Input
        label="Phòng (không bắt buộc)"
        value={room}
        onChangeText={(value) => {
          setRoom(value);
          setError('');
        }}
        placeholder="P302"
        maxLength={50}
        autoCapitalize="characters"
      />
      <Button
        title={busy ? 'Đang tạo…' : 'Tạo hồ sơ và thêm vào cửa'}
        disabled={busy || !unitId}
        loading={busy}
        onPress={() => {
          void submit();
        }}
      />
    </ScrollView>
  );
}

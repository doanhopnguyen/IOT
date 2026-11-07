import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { managerService, type UnitUserDto } from '../services/api/managerService';
import { AppModal, Button, Card, Notice, styles as s } from './ui';
import { MemberPermissions } from './MemberPermissions';
import { CredentialEnrollment } from './CredentialEnrollment';

export function OwnerCredentials({ unitId, ready }: { unitId: number; ready: boolean }) {
  const [owner, setOwner] = useState<UnitUserDto>();
  const [error, setError] = useState('');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const reload = useCallback(async () => {
    setOwner(await managerService.ownerAccess(unitId));
    setError('');
  }, [unitId]);
  useEffect(() => {
    let active = true;
    void managerService
      .ownerAccess(unitId)
      .then((value) => {
        if (active) {
          setOwner(value);
          setError('');
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : 'Chưa tải được thông tin chủ cửa.');
      });
    return () => {
      active = false;
    };
  }, [unitId]);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!owner)
    return (
      <Card>
        <Text style={s.description}>Đang tải thẻ và vân tay của bạn…</Text>
      </Card>
    );
  const methods = [owner.allowRfid && 'RFID', owner.allowFingerprint && 'Vân tay'].filter(
    (v): v is string => Boolean(v),
  );
  return (
    <>
      <MemberPermissions
        unitId={unitId}
        userId={owner.userId}
        methods={methods}
        changed={reload}
        self
        disabled={!ready}
      />
      {!ready ? (
        <Notice tone="info">
          Hoàn tất Wi-Fi, PIN và hiệu chỉnh cửa trước khi đăng ký thẻ/vân tay của bạn.
        </Notice>
      ) : null}
      <Button
        title="Thêm vân tay hoặc thẻ NFC/RFID"
        icon="add-circle-outline"
        disabled={!ready}
        onPress={() => setEnrollOpen(true)}
      />
      <AppModal
        visible={enrollOpen}
        title="Thêm phương thức mở cửa"
        onClose={() => setEnrollOpen(false)}
      >
        <CredentialEnrollment
          unitId={unitId}
          userId={owner.userId}
          changed={reload}
          disabled={!ready}
        />
      </AppModal>
    </>
  );
}

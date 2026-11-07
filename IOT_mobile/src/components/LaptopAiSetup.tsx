import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { doorPairingCode } from '../services/api/laptopAi';
import { colors, fonts } from '../theme/tokens';
import { Badge, Card, styles as s } from './ui';

export function LaptopAiSetup({ unitId }: { unitId: number }) {
  return (
    <Card style={{ gap: 14 }}>
      <View style={s.row}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="laptop-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.heading}>Nhận diện bằng Laptop</Text>
          <Text style={s.caption}>Kết nối ứng dụng Smart Door AI trên máy tính</Text>
        </View>
        <Badge label="Tự động" tone="primary" />
      </View>

      <View
        style={{
          padding: 16,
          borderRadius: 16,
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Text style={s.caption}>Mã ghép nối cửa</Text>
        <Text
          selectable
          style={{
            fontFamily: fonts.extrabold,
            fontSize: 24,
            fontWeight: '800',
            color: colors.primary,
            letterSpacing: 2,
          }}
        >
          {doorPairingCode(unitId)}
        </Text>
      </View>

      <Text style={s.caption}>
        Đăng nhập cùng tài khoản chủ cửa trên ứng dụng Smart Door AI (Laptop) và chọn mã cửa trên để
        đồng bộ khuôn mặt tự động.
      </Text>
    </Card>
  );
}


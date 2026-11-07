import { Text } from 'react-native';
import { doorPairingCode } from '../services/api/laptopAi';
import { Card, styles as s } from './ui';

export function LaptopAiSetup({ unitId }: { unitId: number }) {
  return <Card>
    <Text style={s.heading}>Nhận diện bằng laptop</Text>
    <Text style={s.caption}>Mã cửa dành cho laptop</Text>
    <Text selectable style={[s.heading, { letterSpacing: 2 }]}>{doorPairingCode(unitId)}</Text>
    <Text style={s.description}>Mở Smart Door AI trên laptop, đăng nhập cùng tài khoản chủ cửa và chọn mã này. Bật tự chạy để camera nhận diện ngay khi cửa thiết lập xong.</Text>
    <Text style={s.caption}>Cấp quyền camera trên laptop. Người dùng cần đăng ký khuôn mặt và được cấp quyền tại cửa trước khi mở bằng nhận diện.</Text>
  </Card>;
}

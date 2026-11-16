import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme/tokens';
import { Card, type IconName, styles as s } from './ui';

const sections = {
  'door-pin': { icon: 'keypad-outline', color: colors.primary, soft: colors.primarySoft, category: 'TRUY CẬP HẰNG NGÀY', title: 'Mở cửa bằng mã PIN', detail: 'Quản lý mã 6 chữ số dùng trên bàn phím của khóa.' },
  'admin-pin': { icon: 'key-outline', color: colors.purple, soft: colors.purpleSoft, category: 'QUẢN TRỊ TẠI CỬA', title: 'Bảo vệ quyền quản trị', detail: 'PIN riêng để vào menu thiết bị và xác nhận các thay đổi quan trọng.' },
  servo: { icon: 'options-outline', color: colors.sky, soft: colors.skySoft, category: 'CHUYỂN ĐỘNG CHỐT', title: 'Căn góc khóa và mở', detail: 'Đối chiếu góc đang lưu, quay thử từng bước và lưu hành trình phù hợp.' },
  calibrate: { icon: 'locate-outline', color: colors.purple, soft: colors.purpleSoft, category: 'CẢM ỨNG & CẢM BIẾN', title: 'Hiệu chỉnh chính xác', detail: 'Căn các điểm chạm trên màn hình khóa và xác nhận cánh cửa đóng / mở.' },
  wifi: { icon: 'wifi-outline', color: colors.teal, soft: colors.tealSoft, category: 'KẾT NỐI MẠNG', title: 'Kết nối Wi-Fi cho cửa', detail: 'Xem mạng đã lưu và đổi sang Wi-Fi 2.4 GHz qua trang thiết lập của khóa.' },
  'camera-ai': { icon: 'videocam-outline', color: colors.indigo, soft: colors.indigoSoft, category: 'NHẬN DIỆN KHUÔN MẶT', title: 'Camera AI của bạn', detail: 'Kết nối Smart Door AI trên laptop hoặc ghép bộ camera được quản trị viên cấp.' },
  lockdown: { icon: 'shield-half-outline', color: colors.rose, soft: colors.roseSoft, category: 'AN NINH CHỦ ĐỘNG', title: 'Tạm dừng quyền ra vào', detail: 'Tạm khóa quyền của thành viên khi cần kiểm soát lại an ninh tại cửa.' },
  'factory-reset': { icon: 'refresh-circle-outline', color: colors.error, soft: colors.errorSoft, category: 'KHÔI PHỤC THIẾT BỊ', title: 'Thiết lập lại từ đầu', detail: 'Xem dữ liệu sẽ xóa và xác thực trước khi đưa cửa về trạng thái ban đầu.' },
  health: { icon: 'pulse-outline', color: colors.teal, soft: colors.tealSoft, category: 'CHẨN ĐOÁN KẾT NỐI', title: 'Theo dõi tình trạng cửa', detail: 'Kiểm tra heartbeat và phản hồi của từng module, dựa trên dữ liệu thiết bị gửi về.' },
} satisfies Record<string, { icon: IconName; color: string; soft: string; category: string; title: string; detail: string }>;

export type HardwareSection = keyof typeof sections;
export function isHardwareSection(value: string): value is HardwareSection {
  return Object.prototype.hasOwnProperty.call(sections, value);
}

export function HardwareSectionHero({ section }: { section: HardwareSection }) {
  const item = sections[section];
  return <Card style={{ backgroundColor: item.soft, borderColor: item.soft, gap: 12 }}>
    <View style={h.row}>
      <View style={[h.heroIcon, { borderColor: item.color + '25' }]}>
        <Ionicons name={item.icon} size={27} color={item.color} />
      </View>
      <Text style={[h.eyebrow, { color: item.color }]}>{item.category}</Text>
    </View>
    <Text style={h.title}>{item.title}</Text>
    <Text style={s.description}>{item.detail}</Text>
  </Card>;
}

export function SettingsSteps({ steps, color = colors.teal }: { steps: { title: string; detail: string }[]; color?: string }) {
  return <View style={{ gap: 18 }}>
    {steps.map((step, index) => <View key={step.title} style={[h.row, { alignItems: 'flex-start' }]}>
      <View style={[h.stepNumber, { backgroundColor: color + '12' }]}>
        <Text style={{ fontFamily: fonts.bold, color }}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={h.stepTitle}>{step.title}</Text><Text style={s.caption}>{step.detail}</Text>
      </View>
    </View>)}
  </View>;
}

export function PinPreview({ value, admin = false }: { value: string; admin?: boolean }) {
  const color = admin ? colors.purple : colors.primary;
  return <View style={{ gap: 10 }} accessible accessibilityLabel={`Đã nhập ${value.length} trên 6 chữ số`}>
    <Text style={s.caption}>Mã PIN mới · {value.length}/6 chữ số</Text>
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {Array.from({ length: 6 }, (_, i) => <View key={i} style={[h.pinCell,
        { borderColor: i < value.length ? color : colors.border, backgroundColor: i < value.length ? color + '0D' : colors.surfaceAlt }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i < value.length ? color : colors.borderStrong }} />
      </View>)}
    </View>
  </View>;
}

export function CalibrationDiagram({ stage }: { stage: string }) {
  const point = stage.startsWith('TOUCH_') ? Number(stage.slice(6)) : 0;
  return <View style={h.touchScreen} accessible accessibilityLabel={point ? `Điểm chạm hiện tại ${point} trên 4` : 'Ba điểm căn cảm ứng và một điểm xác nhận ở giữa'}>
    {[1, 2, 3, 4].map(index => <View key={index} style={[h.touchPoint,
      { position: 'absolute', ...(index === 1 ? { left: 12, top: 12 } : index === 2 ? { right: 12, top: 12 } : index === 3 ? { left: 12, bottom: 12 } : { left: '50%', top: 65, marginLeft: -18 }),
        backgroundColor: point === index ? colors.purple : colors.surface, borderColor: point === index ? colors.purple : '#DDD6FE' }]}>
      <Ionicons name="add" size={18} color={point === index ? '#fff' : colors.purple} />
      <Text style={{ color: point === index ? '#fff' : colors.purple, fontSize: 11 }}>{index}</Text>
    </View>)}
    <View pointerEvents="none" style={h.touchCaption}>
      <Text style={[s.caption, { textAlign: 'center' }]}>Chạm trên màn hình khóa</Text></View>
  </View>;
}

const h = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  heroIcon: { width: 50, height: 50, borderRadius: 17, borderWidth: 1, backgroundColor: '#FFFFFFCC', justifyContent: 'center', alignItems: 'center' },
  eyebrow: { flex: 1, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.1, lineHeight: 17 },
  title: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 29, color: colors.text },
  stepNumber: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.text },
  pinCell: { flex: 1, height: 46, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  touchScreen: { height: 180, padding: 12, backgroundColor: colors.purpleSoft, borderRadius: 22, borderWidth: 1, borderColor: '#E9D5FF', justifyContent: 'space-between' },
  touchPoint: { width: 36, height: 36, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  touchCaption: { position: 'absolute', top: 110, left: 60, right: 12, alignItems: 'center' },
});

import { ScrollView, Text, View } from 'react-native';
import type { AlertStatistics as Statistics } from '../services/api/alertService';
import { colors } from '../theme/tokens';
import { Card, styles as s } from './ui';

const levels = [
  { key: 'info', label: 'INFO', color: colors.primary },
  { key: 'warning', label: 'WARNING', color: colors.warning },
  { key: 'critical', label: 'CRITICAL', color: colors.error },
] as const;

export function AlertStatistics({ data }: {
  data?: Statistics;
}) {
  const totals = levels.map(level => ({ ...level,
    count: data?.days.reduce((sum, day) => sum + day[level.key], 0) ?? 0,
  }));
  const periodTotal = totals.reduce((sum, level) => sum + level.count, 0);
  const max = Math.max(1, ...(data?.days.map(day => day.info + day.warning + day.critical) ?? []));
  return <View style={{ gap: 12 }}>
    <Text style={s.heading}>Tổng quan</Text>
    <Text style={s.caption}>Theo bộ lọc đang chọn</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[
        { label: 'Tổng cảnh báo', value: data?.total, color: colors.primary },
        { label: 'Chưa xem', value: data?.unread, color: colors.warning },
        { label: 'Khẩn cấp chưa xử lý', value: data?.urgentUnresolved, color: colors.error },
      ].map(item => <Card key={item.label} style={{ flex: 1, padding: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: item.color }}>{item.value ?? '—'}</Text>
        <Text style={s.caption}>{item.label}</Text>
      </Card>)}
    </View>
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={s.heading}>Cảnh báo theo ngày</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {levels.map(level => <Text key={level.key} style={{ fontSize: 12, color: level.color }}>● {level.label}</Text>)}
      </View>
      {data ? <>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}>
          {data.days.map(day => {
            const total = day.info + day.warning + day.critical;
            const label = `${day.date.slice(8)}/${day.date.slice(5, 7)}`;
            return <View key={day.date} accessible
              accessibilityLabel={`${label}: INFO ${day.info}, WARNING ${day.warning}, CRITICAL ${day.critical}`}
              style={{ flex: 1, minWidth: 38, alignItems: 'center', gap: 6 }}>
              <View style={{ height: 148, justifyContent: 'flex-end', alignItems: 'center', width: '100%',
                borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 10, color: colors.muted }}>{total}</Text>
                <View style={{ width: 20, overflow: 'hidden', borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
                  {[...levels].reverse().map(level => <View key={level.key}
                    style={{ height: day[level.key] / max * 120, backgroundColor: level.color }} />)}
                </View>
              </View>
              <Text style={{ fontSize: 10, color: colors.muted }}>{label}</Text>
            </View>;
          })}
        </ScrollView>
        {!periodTotal ? <Text style={s.caption}>Không có cảnh báo trong khoảng đã chọn.</Text> : null}
      </> : <Text style={s.caption}>Chưa có dữ liệu thống kê.</Text>}
    </Card>
    <Card>
      <Text style={s.heading}>Phân bố mức độ</Text>
      {data ? totals.map(level => {
        const percent = periodTotal ? level.count / periodTotal * 100 : 0;
        return <View key={level.key} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: level.color, fontSize: 13, fontWeight: '600' }}>{level.label}</Text>
            <Text style={s.caption}>{level.count} · {percent.toFixed(1)}%</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.background, overflow: 'hidden' }}>
            <View style={{ height: 8, width: `${percent}%`, backgroundColor: level.color }} />
          </View>
        </View>;
      }) : <Text style={s.caption}>Chưa có dữ liệu thống kê.</Text>}
    </Card>
  </View>;
}

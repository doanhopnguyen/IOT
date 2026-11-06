import { Text, View } from 'react-native';
import { barHeights } from './chartMath';
import { colors } from '../theme/tokens';

export interface BarGroup { label: string; values: number[]; }

/** Biểu đồ cột nhóm vẽ bằng View (không thêm thư viện). Mỗi nhóm có values theo thứ tự colors. */
export function BarChart({ data, colors: series, height = 120, max, legend }: {
  data: BarGroup[]; colors: string[]; height?: number; max?: number; legend?: string[];
}) {
  const flat = data.flatMap(g => g.values);
  const top = max ?? Math.max(0, ...flat);
  const heights = barHeights(flat, height, top);
  let index = 0;
  return <View accessibilityRole="image" accessibilityLabel={legend ? `Biểu đồ ${legend.join(', ')}` : 'Biểu đồ'}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: height + 18, gap: 4 }}>
      {data.map((group, groupIndex) => <View key={`${group.label}-${groupIndex}`} style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 2 }}>
          {group.values.map((value, i) => {
            const h = heights[index++];
            return <View key={i} style={{ width: 8, height: Math.max(h, value > 0 ? 2 : 0), backgroundColor: series[i % series.length], borderRadius: 2 }} />;
          })}
        </View>
        <Text style={{ fontSize: 10, color: colors.text }}>{group.label}</Text>
      </View>)}
    </View>
    {legend ? <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>{legend.map((name, i) =>
      <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 10, height: 10, backgroundColor: series[i % series.length], borderRadius: 2 }} />
        <Text style={{ fontSize: 12 }}>{name}</Text>
      </View>)}</View> : null}
  </View>;
}

import { Text, View } from 'react-native';
import { colors } from '../theme/tokens';
import { styles as s } from './ui';

export function SetupProgress({ step, total, title, detail }: { step: number; total: number; title: string; detail?: string }) {
  return <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
    <Text style={s.caption}>Bước {step} / {total}</Text>
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: total }, (_, index) => <View key={index} style={{ flex: 1, height: 4, borderRadius: 3, backgroundColor: index < step ? colors.primary : colors.border }} />)}
    </View>
    <Text style={s.heading}>{title}</Text>
    {detail ? <Text style={s.description}>{detail}</Text> : null}
  </View>;
}

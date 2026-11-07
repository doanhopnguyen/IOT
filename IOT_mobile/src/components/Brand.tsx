import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts } from '../theme/tokens';

/** The same geometric mark used by Web Admin, rendered natively on Android and web. */
export function Brand({ large = false, light = false }: { large?: boolean; light?: boolean }) {
  const size = large ? 36 : 28;
  return (
    <View style={s.row} accessibilityLabel="Smart Door">
      <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={true}>
        <Path d="M20 3H8L2 9l6 6h4L6 9l3-3h8Z" fill={light ? '#C7D2FE' : colors.brand} />
        <Path d="M4 21h12l6-6-6-6h-4l6 6-3 3H7Z" fill={light ? '#C7D2FE' : colors.brand} />
      </Svg>
      <Text style={[s.name, large && s.large, light && s.light]}>Smart Door</Text>
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  name: {
    fontFamily: fonts.bold,
    color: colors.navy,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  large: { fontSize: 30, lineHeight: 38 },
  light: { color: '#FFFFFF' },
});

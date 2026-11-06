import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';
export type TabKey = 'home' | 'devices' | 'invitations' | 'profile';
const items: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'home', label: 'Trang chủ', icon: 'home-outline' },
  { key: 'devices', label: 'Cửa của tôi', icon: 'grid-outline' },
  { key: 'invitations', label: 'Lời mời', icon: 'mail-outline' },
  { key: 'profile', label: 'Cá nhân', icon: 'person-outline' },
];
export function FloatingNav({
  active,
  onTab,
  onAdd,
}: {
  active: TabKey;
  onTab: (tab: TabKey) => void;
  onAdd: () => void;
}) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const tab = (item: (typeof items)[number]) => (
    <Pressable
      key={item.key}
      onPress={() => onTab(item.key)}
      style={s.item}
      accessibilityRole="tab"
      accessibilityState={{ selected: active === item.key }}
      accessibilityLabel={item.label}
    >
      <View style={[s.tabIcon, active === item.key && s.selected]}>
        <Ionicons
          name={item.icon}
          size={22}
          color={active === item.key ? colors.primary : colors.muted}
        />
      </View>
      <Text style={[s.label, active === item.key && { color: colors.primary, fontWeight: '700' }]}>
        {item.label}
      </Text>
    </Pressable>
  );
  if (keyboardVisible) return null;
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: 12 }]}>
      <View style={s.bar}>
        {items.slice(0, 2).map(tab)}
        <Pressable
          onPress={onAdd}
          style={s.add}
          accessibilityRole="button"
          accessibilityLabel="Thêm thiết bị"
        >
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
        {items.slice(2).map(tab)}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, alignItems: 'center' },
  bar: {
    width: '100%',
    maxWidth: 620,
    minHeight: 80,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  item: { flex: 1, minHeight: 64, gap: 3, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  selected: { backgroundColor: colors.primarySoft },
  label: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center' },
  add: {
    height: 47,
    width: 47,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
  },
});

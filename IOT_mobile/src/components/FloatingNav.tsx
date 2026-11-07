import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme/tokens';

export type TabKey = 'home' | 'devices' | 'invitations' | 'profile';
const items: {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'home', label: 'Trang chủ', icon: 'home-outline', activeIcon: 'home' },
  { key: 'devices', label: 'Cửa của tôi', icon: 'grid-outline', activeIcon: 'grid' },
  { key: 'invitations', label: 'Lời mời', icon: 'mail-outline', activeIcon: 'mail' },
  { key: 'profile', label: 'Cá nhân', icon: 'person-outline', activeIcon: 'person' },
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
  const tab = (item: (typeof items)[number]) => {
    const isSelected = active === item.key;
    return (
      <Pressable
        key={item.key}
        onPress={() => onTab(item.key)}
        style={s.item}
        accessibilityRole="tab"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={item.label}
      >
        <View style={[s.tabIcon, isSelected && s.selected]}>
          <Ionicons
            name={isSelected ? item.activeIcon : item.icon}
            size={21}
            color={isSelected ? colors.primary : colors.muted}
          />
        </View>
        <Text style={[s.label, isSelected && s.labelSelected]}>{item.label}</Text>
      </Pressable>
    );
  };
  if (keyboardVisible) return null;
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: 14 }]}>
      <View style={s.bar}>
        {items.slice(0, 2).map(tab)}
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [s.add, pressed && { transform: [{ scale: 0.95 }] }]}
          accessibilityRole="button"
          accessibilityLabel="Thêm thiết bị"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
        {items.slice(2).map(tab)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: {
    width: '100%',
    maxWidth: 560,
    minHeight: 76,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.11,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  item: { flex: 1, minHeight: 60, gap: 4, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: radius.pill },
  selected: { backgroundColor: colors.primarySoft },
  label: { fontSize: 12, lineHeight: 16, color: colors.muted, textAlign: 'center', fontWeight: '600' },
  labelSelected: { color: colors.primary, fontWeight: '800' },
  add: {
    height: 52,
    width: 52,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});

import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { OverlayStore } from '../services/overlayStore';

interface Content { children: ReactNode; onClose: () => void; floating: boolean; }
const Context = createContext<OverlayStore<Content> | null>(null);
function useOverlays() {
  const store = useContext(Context);
  if (!store) throw new Error('App overlays require OverlayProvider.');
  return store;
}
export function OverlayProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new OverlayStore<Content>());
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function AppOverlay({ visible, children, onClose, priority = 0, floating = false }: {
  visible: boolean; children: ReactNode; onClose: () => void; priority?: number; floating?: boolean;
}) {
  const store = useOverlays(), id = useId();
  const value = useMemo(() => ({ children, onClose, floating }), [children, onClose, floating]);
  useLayoutEffect(() => {
    if (visible) store.set(id, priority, value);
    else store.remove(id);
  }, [store, id, visible, priority, value]);
  useLayoutEffect(() => () => store.remove(id), [store, id]);
  return null;
}

// Place the host inside the global notification/confirmation providers so
// dialog content keeps access to those contexts after registration.
export function OverlayHost() {
  const store = useOverlays();
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const modals = entries.filter(entry => !entry.value.floating);
  const top = modals[modals.length - 1];
  const banners = entries.filter(entry => entry.value.floating && (!top || entry.priority > top.priority));
  const topId = top?.id;
  useEffect(() => { if (topId) Keyboard.dismiss(); }, [topId]);
  const floating = banners.length ? <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
    {banners.map(entry => <View key={entry.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>{entry.value.children}</View>)}
  </View> : null;
  return <><Modal visible={!!top} transparent animationType="fade" presentationStyle="overFullScreen"
    statusBarTranslucent navigationBarTranslucent onRequestClose={() => top?.value.onClose()}>
    <View style={{ flex: 1 }}>
      {modals.map(entry => <View key={entry.id} style={[StyleSheet.absoluteFill, entry.id !== top?.id && { display: 'none' }]}
        accessibilityViewIsModal={entry.id === top?.id}
        accessibilityElementsHidden={entry.id !== top?.id}
        importantForAccessibility={entry.id === top?.id ? 'auto' : 'no-hide-descendants'}>
        {entry.value.children}
      </View>)}
      {top ? floating : null}
    </View>
  </Modal>
    {!top && floating ? (Platform.OS === 'ios' ? <FullWindowOverlay>{floating}</FullWindowOverlay> : floating) : null}
  </>;
}

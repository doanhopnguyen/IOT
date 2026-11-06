import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Text } from 'react-native';
import { AppModal, Button, Notice, styles } from './ui';

type Options = { title: string; message: string; confirmLabel?: string; destructive?: boolean };
type Confirm = (options: Options) => Promise<boolean>;
const Context = createContext<Confirm | null>(null);
export function useConfirm() {
  const confirm = useContext(Context);
  if (!confirm) throw Error('Missing confirmation provider');
  return confirm;
}
export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Options | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const confirm = useCallback<Confirm>((next) => {
    if (resolverRef.current) return Promise.resolve(false);
    setOptions(next);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);
  useEffect(
    () => () => {
      resolverRef.current?.(false);
    },
    [],
  );
  const finish = (value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  };
  return (
    <Context.Provider value={confirm}>
      {children}
      <AppModal visible={!!options} title={options?.title ?? ''} onClose={() => finish(false)}>
        {options?.destructive ? (
          <Notice tone="warning">{options.message}</Notice>
        ) : (
          <Text style={styles.description}>{options?.message}</Text>
        )}
        <Button
          title={options?.confirmLabel ?? 'Xác nhận'}
          variant={options?.destructive ? 'danger' : 'primary'}
          onPress={() => finish(true)}
        />
        <Button title="Hủy" variant="ghost" onPress={() => finish(false)} />
      </AppModal>
    </Context.Provider>
  );
}

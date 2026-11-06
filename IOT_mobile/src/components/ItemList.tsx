import { ReactNode, useState } from 'react';
import { View } from 'react-native';
import { Button } from './ui';

/** Progressive rendering of data already authorized and returned by the existing API. */
export function ItemList<T>({
  items,
  renderItem,
  resetKey = '',
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  resetKey?: string;
}) {
  return <ListPage key={resetKey} items={items} renderItem={renderItem} />;
}
function ListPage<T>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const [limit, setLimit] = useState(10);
  return (
    <>
      {items.slice(0, limit).map(renderItem)}
      {items.length > limit ? (
        <View style={{ width: '100%' }}>
          <Button
            title={`Xem thêm ${Math.min(10, items.length - limit)} mục`}
            variant="ghost"
            onPress={() => setLimit((count) => count + 10)}
          />
        </View>
      ) : null}
    </>
  );
}

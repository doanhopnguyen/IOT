import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Reference } from '../services/api/client';
import { parseAlertDate } from '../services/api/alertFilters';
import { colors } from '../theme/tokens';
import { AppModal, Button, Card, Input, Notice, styles as s } from './ui';

export type AlertPeriod = 1 | 7 | 30 | 'custom';
const displayDate = (date: string) => date.split('-').reverse().join('/');

export function AlertFilters({ users, userId, period, range, onUser, onPeriod, onRange }: {
  users: Reference[]; userId?: number; period: AlertPeriod; range: { from: string; to: string };
  onUser: (id?: number) => void; onPeriod: (period: 1 | 7 | 30) => void;
  onRange: (range: { from: string; to: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  return <Card style={{ padding: 14 }}>
    <Text style={s.heading}>Bộ lọc cảnh báo</Text>
    <Button variant="ghost" icon="people-outline"
      title={userId === undefined ? 'Tất cả người dùng' : users.find(user => user.id === userId)?.name ?? 'Người dùng đã chọn'}
      onPress={() => { setSearch(''); setOpen(true); }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {([1, 7, 30, 'custom'] as const).map(value => <Pressable key={value}
        accessibilityRole="button" accessibilityState={{ selected: period === value }}
        onPress={() => {
          setError('');
          if (value === 'custom') {
            setFrom(displayDate(range.from)); setTo(displayDate(range.to)); setCustom(true);
          } else { setCustom(false); onPeriod(value); }
        }} style={{ minHeight: 40, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999,
          backgroundColor: period === value ? colors.primary : colors.background, justifyContent: 'center' }}>
        <Text style={{ color: period === value ? '#fff' : colors.muted, fontWeight: '700', fontSize: 13 }}>
          {value === 'custom' ? 'Tùy chọn' : value === 1 ? 'Hôm nay' : `${value} ngày`}
        </Text>
      </Pressable>)}
    </View>
    {custom ? <>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Input style={{ flex: 1 }} label="Từ ngày" placeholder="dd/mm/yyyy" value={from} onChangeText={setFrom} maxLength={10} />
        <Input style={{ flex: 1 }} label="Đến ngày" placeholder="dd/mm/yyyy" value={to} onChangeText={setTo} maxLength={10} />
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button title="Áp dụng khoảng ngày" variant="ghost" onPress={() => {
        const start = parseAlertDate(from), end = parseAlertDate(to);
        if (!start || !end || start > end) { setError('Nhập ngày hợp lệ, từ ngày không sau đến ngày.'); return; }
        if ((Date.parse(end) - Date.parse(start)) / 86400000 > 365) {
          setError('Chọn khoảng thời gian tối đa 366 ngày.'); return;
        }
        setError(''); setCustom(false); onRange({ from: start, to: end });
      }} />
    </> : null}
    <Text style={s.caption}>{displayDate(range.from)} – {displayDate(range.to)}</Text>
    <AppModal visible={open} title="Lọc theo người dùng" onClose={() => setOpen(false)}>
      <Input placeholder="Tìm tên người dùng" value={search} onChangeText={setSearch} />
      <Button title="Tất cả người dùng" variant="ghost" onPress={() => { onUser(undefined); setOpen(false); }} />
      {users.filter(user => user.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map(user => <Button
        key={user.id} title={`${userId === user.id ? '✓ ' : ''}${user.name}`} variant="ghost"
        onPress={() => { onUser(user.id); setOpen(false); }} />)}
      {!users.length ? <Text style={s.caption}>Chưa có người dùng thuộc cửa bạn quản lý.</Text> : null}
    </AppModal>
  </Card>;
}

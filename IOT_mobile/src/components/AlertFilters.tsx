import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { Reference } from '../services/api/client';
import { parseAlertDate } from '../services/api/alertFilters';
import { colors, fonts, radius } from '../theme/tokens';
import { AppModal, Button, Input, Notice, styles as s } from './ui';

export type AlertPeriod = 1 | 7 | 30 | 'custom';
const displayDate = (date: string) => date.split('-').reverse().join('/');

export function AlertFilters({ users, userId, period, range, onUser, onPeriod, onRange }: {
  users: Reference[]; userId?: number; period: AlertPeriod; range: { from: string; to: string };
  onUser: (id?: number) => void; onPeriod: (period: 1 | 7 | 30) => void;
  onRange: (range: { from: string; to: string }) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [custom, setCustom] = useState(period === 'custom');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const selectedUserName =
    userId === undefined
      ? 'Mọi người'
      : users.find((user) => user.id === userId)?.name ?? 'Đã chọn';
  const periodLabel =
    period === 'custom'
      ? `${displayDate(range.from)} - ${displayDate(range.to)}`
      : period === 1
        ? 'Hôm nay'
        : `${period} ngày`;

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Ionicons name="calendar-outline" size={14} color={colors.muted} />
          <Text style={[s.caption, { fontSize: 12.5 }]} numberOfLines={1}>
            {periodLabel} · {selectedUserName}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bộ lọc cảnh báo"
          onPress={() => {
            setError('');
            setCustom(period === 'custom');
            setFrom(displayDate(range.from));
            setTo(displayDate(range.to));
            setSheetOpen(true);
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Ionicons name="options-outline" size={15} color={colors.primary} />
          <Text
            style={{
              fontFamily: fonts.semibold,
              fontSize: 12.5,
              fontWeight: '600',
              color: colors.text,
            }}
          >
            Bộ lọc
          </Text>
        </Pressable>
      </View>

      <AppModal
        visible={sheetOpen}
        title="Bộ lọc cảnh báo"
        onClose={() => setSheetOpen(false)}
      >
        <Text style={s.heading}>Khoảng thời gian</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([1, 7, 30, 'custom'] as const).map((value) => {
            const active = (custom && value === 'custom') || (!custom && period === value);
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setError('');
                  if (value === 'custom') {
                    setFrom(displayDate(range.from));
                    setTo(displayDate(range.to));
                    setCustom(true);
                  } else {
                    setCustom(false);
                    onPeriod(value);
                    setSheetOpen(false);
                  }
                }}
                style={{
                  flex: 1,
                  minHeight: 38,
                  paddingHorizontal: 8,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: active ? fonts.bold : fonts.semibold,
                    color: active ? '#fff' : colors.muted,
                    fontWeight: active ? '700' : '600',
                    fontSize: 12.5,
                  }}
                  numberOfLines={1}
                >
                  {value === 'custom' ? 'Tùy chọn' : value === 1 ? 'Hôm nay' : `${value} ngày`}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {custom ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Input
                style={{ flex: 1 }}
                label="Từ ngày"
                placeholder="dd/mm/yyyy"
                value={from}
                onChangeText={setFrom}
                maxLength={10}
              />
              <Input
                style={{ flex: 1 }}
                label="Đến ngày"
                placeholder="dd/mm/yyyy"
                value={to}
                onChangeText={setTo}
                maxLength={10}
              />
            </View>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button
              title="Áp dụng khoảng ngày"
              onPress={() => {
                const start = parseAlertDate(from);
                const end = parseAlertDate(to);
                if (!start || !end || start > end) {
                  setError('Nhập ngày hợp lệ, từ ngày không sau đến ngày.');
                  return;
                }
                if ((Date.parse(end) - Date.parse(start)) / 86400000 > 365) {
                  setError('Chọn khoảng thời gian tối đa 366 ngày.');
                  return;
                }
                setError('');
                setCustom(false);
                onRange({ from: start, to: end });
                setSheetOpen(false);
              }}
            />
          </View>
        ) : null}

        <Text style={s.heading}>Người dùng liên quan</Text>
        <Button
          variant="ghost"
          icon="people-outline"
          title={
            userId === undefined
              ? 'Tất cả người dùng'
              : users.find((user) => user.id === userId)?.name ?? 'Người dùng đã chọn'
          }
          onPress={() => {
            setSearch('');
            setSheetOpen(false);
            setUserModalOpen(true);
          }}
        />
        <Button title="Đóng" variant="ghost" onPress={() => setSheetOpen(false)} />
      </AppModal>

      <AppModal
        visible={userModalOpen}
        title="Lọc theo người dùng"
        onClose={() => setUserModalOpen(false)}
      >
        <Input placeholder="Tìm tên người dùng" value={search} onChangeText={setSearch} />
        <Button
          title="Tất cả người dùng"
          variant="ghost"
          onPress={() => {
            onUser(undefined);
            setUserModalOpen(false);
          }}
        />
        {users
          .filter((user) =>
            user.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')),
          )
          .map((user) => (
            <Button
              key={user.id}
              title={`${userId === user.id ? '✓ ' : ''}${user.name}`}
              variant="ghost"
              onPress={() => {
                onUser(user.id);
                setUserModalOpen(false);
              }}
            />
          ))}
        {!users.length ? (
          <Text style={s.caption}>Chưa có người dùng thuộc cửa bạn quản lý.</Text>
        ) : null}
      </AppModal>
    </>
  );
}


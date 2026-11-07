// Chủ cửa tạm khóa cửa: chip chỉ còn nhận vân tay/thẻ của chủ cửa, không tự hết hạn.
export function lockdownCopy(lockedDown: boolean): { title: string; button: string; confirm: string } {
  return lockedDown
    ? {
        title: 'Cửa đang tạm khóa',
        button: 'Mở khóa cửa',
        confirm: 'Thành viên sẽ mở cửa lại được như bình thường. Mở khóa?',
      }
    : {
        title: 'Cửa đang hoạt động bình thường',
        button: 'Tạm khóa cửa',
        confirm: 'Mọi người sẽ không mở được cửa, trừ vân tay và thẻ của bạn. Tạm khóa?',
      };
}

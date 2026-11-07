// Hồ sơ chỉ dùng tại cửa: giới hạn khớp với CreateMemberProfileRequest ở backend.
export interface MemberProfileInput { fullName: string; room?: string }

export type MemberProfileValidation =
  | { ok: true; value: MemberProfileInput }
  | { ok: false; message: string };

export function validateMemberProfileInput(input: { fullName: string; room: string }): MemberProfileValidation {
  const fullName = input.fullName.trim();
  const room = input.room.trim();
  if (!fullName) return { ok: false, message: 'Vui lòng nhập họ và tên.' };
  if (fullName.length > 100) return { ok: false, message: 'Họ và tên tối đa 100 ký tự.' };
  if (room.length > 50) return { ok: false, message: 'Phòng tối đa 50 ký tự.' };
  return { ok: true, value: room ? { fullName, room } : { fullName } };
}

/** Hồ sơ tại cửa không có SĐT/email (backend ẩn email giả); hồ sơ cũ thì còn liên hệ. */
export function memberContactLabel(p: { hasAccount: boolean; contact?: string | null }): string {
  if (p.hasAccount) return 'Có tài khoản ứng dụng';
  if (!p.contact) return 'Chỉ dùng tại cửa · vân tay, thẻ';
  return `Chưa đăng nhập ứng dụng · ${p.contact}`;
}

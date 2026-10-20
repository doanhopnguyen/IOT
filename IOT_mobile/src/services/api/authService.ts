import { ApiError, clearCsrf, refreshCsrf, request } from './client';
export interface AccountDto {
  accountId: number; fullName: string; email: string | null; phone: string | null; admin: boolean; status: 'ACTIVE' | 'DISABLED';
}
export interface RegisterInput { fullName: string; email?: string; phone?: string; password: string; }
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const authService = {
  async login(identifier: string, password: string) {
    try {
      await refreshCsrf();
      const account = await request<AccountDto>('/api/auth/login', json({ identifier: identifier.trim(), password }));
      // Đăng nhập tạo session mới nên CSRF token cũ không còn dùng được.
      await refreshCsrf();
      return account;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw new Error('Sai email/số điện thoại hoặc mật khẩu, hoặc tài khoản đã bị khóa.');
      throw error;
    }
  },
  async register(input: RegisterInput) {
    try {
      await refreshCsrf();
      return await request<AccountDto>('/api/auth/register', json({
        fullName: input.fullName.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null, password: input.password,
      }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new Error('Email hoặc số điện thoại đã được sử dụng.');
      if (error instanceof ApiError && error.status === 400) throw new Error('Thông tin đăng ký chưa hợp lệ.');
      throw error;
    }
  },
  // Cookie phiên vẫn còn sau khi tải lại trang: dùng để khôi phục đăng nhập.
  me() { return request<AccountDto>('/api/accounts/me'); },
  logout() {
    clearCsrf();
  },
};

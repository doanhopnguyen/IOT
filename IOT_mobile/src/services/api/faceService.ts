import { request } from './client';

export type FaceRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
export interface FaceProfile {
  hasTemplate: boolean;
  credentialId: number | null;
  model: string | null;
  previewImage?: string | null;
}
export interface FaceRequestDto {
  id: number;
  accountId: number;
  accountName: string;
  unitId: number;
  unitName: string;
  status: FaceRequestStatus;
  requestedAt: string;
  previewImage?: string | null;
  accountEmail?: string | null;
  requestType?: string | null;
}
type Transport = <T>(path: string, init?: RequestInit) => Promise<T>;
const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const id = (value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error('Mã tài khoản hoặc cửa không hợp lệ.');
  return value;
};

export function createFaceService(transport: Transport = request) {
  return {
    profile() {
      return transport<FaceProfile>('/api/faces/me');
    },
    requestAccess(unitId: number) {
      return transport<FaceRequestDto>(
        '/api/faces/requests',
        post({ unitId: id(unitId), consent: true }),
      );
    },
    memberProfile(unitId: number, accountId: number) {
      return transport<FaceProfile>(`/api/faces/accounts/${id(accountId)}?unitId=${id(unitId)}`);
    },
    list(unitId?: number) {
      return transport<FaceRequestDto[]>(
        `/api/faces/requests${unitId === undefined ? '' : `?unitId=${id(unitId)}`}`,
      );
    },
    decide(requestId: number, approved: boolean) {
      return transport<FaceRequestDto>(
        `/api/faces/requests/${id(requestId)}/decision`,
        post({ approved }),
      );
    },
    cancel(requestId: number) {
      return transport<FaceRequestDto>(`/api/faces/requests/${id(requestId)}/cancel`, post());
    },
    revoke() {
      return transport<void>('/api/faces/me', { method: 'DELETE' });
    },
  };
}
export const faceService = createFaceService();

export function faceRequestLabel(request: Pick<FaceRequestDto, 'status'>) {
  if (request.status === 'PENDING') return 'Đã gửi mẫu · chờ chủ cửa duyệt';
  if (request.status === 'APPROVED') return 'Yêu cầu cũ · cần hủy và quét lại trong app';
  if (request.status === 'COMPLETED') return 'Đã duyệt đăng ký khuôn mặt';
  return 'Đã từ chối hoặc hủy';
}

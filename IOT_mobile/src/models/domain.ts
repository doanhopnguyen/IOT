export type DoorRole = 'OWNER' | 'USER';
export type Connectivity = 'ONLINE' | 'OFFLINE';
export type LockState = 'LOCKED' | 'UNLOCKED';
export type AccessStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';
export interface Door { id: string; name: string; role: DoorRole; connectivity: Connectivity; lockState: LockState; members: number; canRemoteUnlock: boolean; lastUpdate: string; }
export interface Person { id: string; name: string; hasAccount: boolean; methods: string[]; access: AccessStatus; sync: SyncStatus; }
export interface Invitation { id: string; owner: string; doorName: string; status: InvitationStatus; }
export interface AccessLog { id: string; person: string; door: string; method: string; time: string; success: boolean; }
export interface VerificationRequest { id: string; doorId: string; doorName: string; requester: string; photoUri: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string; }

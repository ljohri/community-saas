// Mirrors functions/_shared/types.ts but only what the frontend needs.
// Kept in sync manually to avoid path-aliasing into worker code.

export type MemberStatus = "invited" | "active" | "inactive" | "revoked";
export type MemberRole = "member" | "admin";

export interface Member {
  id: number;
  firebase_uid: string | null;
  email: string;
  name: string | null;
  status: MemberStatus;
  role: MemberRole;
  region: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipPeriod {
  id: number;
  member_id: number;
  year: number;
  valid_from: string;
  valid_until: string;
  fee_paid: number;
  amount_due_cents: number;
  amount_paid_cents: number;
  notes: string | null;
}

export interface InviteCode {
  id: number;
  code: string;
  email: string | null;
  role: MemberRole;
  status: "unused" | "used" | "revoked" | "expired";
  expires_at: string | null;
  used_by_member_id: number | null;
  used_by_email?: string | null;
  used_at: string | null;
  created_by_member_id: number | null;
  created_at: string;
}

export interface FinancialTxn {
  id: number;
  member_id: number | null;
  member_email?: string | null;
  txn_type: string;
  direction: "income" | "expense";
  amount_cents: number;
  txn_date: string;
  payment_method: string | null;
  reference: string | null;
  memo: string | null;
  created_at?: string;
}

export interface SessionInfo {
  authenticated: boolean;
  uid: string | null;
  email: string | null;
  role: MemberRole | null;
  memberStatus: MemberStatus | null;
  hasActiveMembership: boolean;
  feePaid: boolean;
  allowedMember: boolean;
  allowedAdmin: boolean;
  currentYear: number;
}

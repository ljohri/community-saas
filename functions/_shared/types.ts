// Shared types used by Pages Functions (Cloudflare Workers runtime).

export interface Env {
  DB: D1Database;
  /** R2 bucket for crawled snapshot files (see scripts/import_snapshot_r2.py). Omitted in some local dev runs unless you pass `--r2`. */
  CONTENT_BUCKET?: R2Bucket;
  FIREBASE_PROJECT_ID: string;
}

export type MemberStatus = "invited" | "active" | "inactive" | "revoked";
export type MemberRole = "member" | "admin";

export interface MemberRow {
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

export interface MembershipPeriodRow {
  id: number;
  member_id: number;
  year: number;
  valid_from: string;
  valid_until: string;
  fee_paid: number; // 0 | 1
  amount_due_cents: number;
  amount_paid_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InviteCodeRow {
  id: number;
  code: string;
  email: string | null;
  role: MemberRole;
  status: "unused" | "used" | "revoked" | "expired";
  expires_at: string | null;
  used_by_member_id: number | null;
  used_at: string | null;
  created_by_member_id: number | null;
  created_at: string;
}

export interface FinancialTxnRow {
  id: number;
  member_id: number | null;
  txn_type: string;
  direction: "income" | "expense";
  amount_cents: number;
  txn_date: string;
  payment_method: string | null;
  reference: string | null;
  memo: string | null;
  recorded_by_member_id: number | null;
  created_at: string;
}

/** Resolved Firebase identity claims, after JWT verification. */
export interface FirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

/** Combined access decision sent to /api/session. */
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

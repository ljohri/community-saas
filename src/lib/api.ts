import { getIdToken } from "../firebase/client";
import type {
  FinancialTxn,
  InviteCode,
  Member,
  MembershipPeriod,
  SessionInfo,
} from "./types";

async function authHeader(): Promise<HeadersInit> {
  const token = await getIdToken().catch(() => null);
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: HeadersInit = {
    accept: "application/json",
    ...(await authHeader()),
  };
  if (body !== undefined) {
    (headers as Record<string, string>)["content-type"] = "application/json";
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : null) ?? `request failed (${res.status})`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public payload: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export const fetchSession = () => request<SessionInfo>("GET", "/api/session");

export const fetchMe = () =>
  request<{
    member: Member;
    currentPeriod: MembershipPeriod | null;
    transactions: FinancialTxn[];
  }>("GET", "/api/me");

export const fetchMemberContent = () =>
  request<{ headline: string; sections: { title: string; body: string }[] }>(
    "GET",
    "/api/member-content",
  );

export const acceptInvite = (code: string) =>
  request<{ ok: true; member: Pick<Member, "id" | "email" | "role" | "status"> }>(
    "POST",
    "/api/accept-invite",
    { code },
  );

export const adminListMembers = () =>
  request<{ members: Member[] }>("GET", "/api/admin/members");

export const adminCreateMember = (m: {
  email: string;
  name?: string | null;
  role?: "member" | "admin";
  status?: "invited" | "active" | "inactive" | "revoked";
  region?: string | null;
}) => request<{ ok: true; id: number }>("POST", "/api/admin/members", m);

export const adminUpdateMember = (
  id: number,
  patch: Partial<Pick<Member, "name" | "status" | "role" | "region">>,
) => request<{ ok: true }>("PATCH", "/api/admin/members", { id, ...patch });

export interface AccountingSummary {
  totalsByYear: { year: number; income_cents: number; expense_cents: number }[];
  duesByYear: { year: number; dues_collected_cents: number }[];
  outstanding: {
    member_id: number;
    email: string;
    name: string | null;
    year: number;
    amount_due_cents: number;
    amount_paid_cents: number;
    outstanding_cents: number;
  }[];
  recentTransactions: FinancialTxn[];
}

export const adminAccounting = () =>
  request<AccountingSummary>("GET", "/api/admin/accounting");

export const adminListInvites = () =>
  request<{ invites: InviteCode[] }>("GET", "/api/admin/invites");

export const adminCreateInvite = (input: {
  email?: string | null;
  role?: "member" | "admin";
  expiresAt?: string | null;
}) =>
  request<{ ok: true; id: number; code: string; acceptUrl: string }>(
    "POST",
    "/api/admin/invites",
    input,
  );

export const adminRevokeInvite = (id: number) =>
  request<{ ok: true }>("PATCH", "/api/admin/invites", { id, status: "revoked" });

export interface RecordPaymentInput {
  memberId?: number | null;
  txnType: string;
  direction: "income" | "expense";
  amountCents: number;
  txnDate: string;
  paymentMethod?: string | null;
  reference?: string | null;
  memo?: string | null;
  membershipYear?: number | null;
  markFeePaid?: boolean;
  amountDueCents?: number | null;
}

export const adminRecordPayment = (input: RecordPaymentInput) =>
  request<{ ok: true; id: number }>("POST", "/api/admin/payments", input);

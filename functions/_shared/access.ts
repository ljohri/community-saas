import type {
  MemberRow,
  MembershipPeriodRow,
  SessionInfo,
} from "./types.js";

export interface AccessInputs {
  authenticated: boolean;
  uid: string | null;
  email: string | null;
  member: MemberRow | null;
  currentPeriod: MembershipPeriodRow | null;
  currentYear: number;
}

/**
 * Pure function: given identity + DB facts, decide what the user is allowed
 * to do. This is intentionally separate from the request layer so it can be
 * unit-tested without a worker runtime.
 */
export function decideAccess(input: AccessInputs): SessionInfo {
  const role = input.member?.role ?? null;
  const memberStatus = input.member?.status ?? null;
  const isAdmin = role === "admin";
  const memberActive = memberStatus === "active";
  const feePaid = !!input.currentPeriod && input.currentPeriod.fee_paid === 1;

  // Admin role grants admin access regardless of fee.
  // Member-only sections require login + active member + fee_paid for the
  // current year.
  const allowedAdmin = input.authenticated && isAdmin;
  const allowedMember =
    input.authenticated && memberActive && feePaid;

  return {
    authenticated: input.authenticated,
    uid: input.uid,
    email: input.email,
    role,
    memberStatus,
    hasActiveMembership: memberActive,
    feePaid,
    allowedMember,
    allowedAdmin,
    currentYear: input.currentYear,
  };
}

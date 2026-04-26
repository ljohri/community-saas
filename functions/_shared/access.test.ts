import { describe, expect, it } from "vitest";
import { decideAccess } from "./access.js";
import type { MemberRow, MembershipPeriodRow } from "./types.js";

const baseMember: MemberRow = {
  id: 1,
  firebase_uid: "uid-1",
  email: "x@example.com",
  name: "X",
  status: "active",
  role: "member",
  region: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const paidPeriod: MembershipPeriodRow = {
  id: 1,
  member_id: 1,
  year: 2026,
  valid_from: "2026-01-01",
  valid_until: "2026-12-31",
  fee_paid: 1,
  amount_due_cents: 5000,
  amount_paid_cents: 5000,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("decideAccess", () => {
  it("denies everything when not authenticated", () => {
    const r = decideAccess({
      authenticated: false,
      uid: null,
      email: null,
      member: null,
      currentPeriod: null,
      currentYear: 2026,
    });
    expect(r.allowedMember).toBe(false);
    expect(r.allowedAdmin).toBe(false);
  });

  it("allows member when active + fee_paid", () => {
    const r = decideAccess({
      authenticated: true,
      uid: "uid-1",
      email: "x@example.com",
      member: baseMember,
      currentPeriod: paidPeriod,
      currentYear: 2026,
    });
    expect(r.allowedMember).toBe(true);
    expect(r.allowedAdmin).toBe(false);
    expect(r.feePaid).toBe(true);
    expect(r.hasActiveMembership).toBe(true);
  });

  it("denies member when fee unpaid", () => {
    const r = decideAccess({
      authenticated: true,
      uid: "uid-1",
      email: "x@example.com",
      member: baseMember,
      currentPeriod: { ...paidPeriod, fee_paid: 0 },
      currentYear: 2026,
    });
    expect(r.allowedMember).toBe(false);
    expect(r.feePaid).toBe(false);
  });

  it("denies member when no period exists", () => {
    const r = decideAccess({
      authenticated: true,
      uid: "uid-1",
      email: "x@example.com",
      member: baseMember,
      currentPeriod: null,
      currentYear: 2026,
    });
    expect(r.allowedMember).toBe(false);
    expect(r.feePaid).toBe(false);
  });

  it("denies member when status != active", () => {
    const r = decideAccess({
      authenticated: true,
      uid: "uid-1",
      email: "x@example.com",
      member: { ...baseMember, status: "invited" },
      currentPeriod: paidPeriod,
      currentYear: 2026,
    });
    expect(r.allowedMember).toBe(false);
    expect(r.hasActiveMembership).toBe(false);
  });

  it("allows admin even without paid fee", () => {
    const r = decideAccess({
      authenticated: true,
      uid: "uid-2",
      email: "a@example.com",
      member: { ...baseMember, role: "admin", status: "active" },
      currentPeriod: null,
      currentYear: 2026,
    });
    expect(r.allowedAdmin).toBe(true);
  });

  it("admin without member row is not granted admin (defensive)", () => {
    const r = decideAccess({
      authenticated: true,
      uid: "uid-3",
      email: "x@example.com",
      member: null,
      currentPeriod: null,
      currentYear: 2026,
    });
    expect(r.allowedAdmin).toBe(false);
    expect(r.allowedMember).toBe(false);
  });
});

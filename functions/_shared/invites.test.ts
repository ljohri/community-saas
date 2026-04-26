import { describe, expect, it } from "vitest";
import { canRedeemInvite, generateInviteCode, isExpired } from "./invites.js";

describe("generateInviteCode", () => {
  it("formats as XXXX-XXXX-XXXX", () => {
    const c = generateInviteCode();
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("avoids confusing characters (I, O, 0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateInviteCode();
      expect(c).not.toMatch(/[IO01]/);
    }
  });

  it("produces fresh values across calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) set.add(generateInviteCode());
    expect(set.size).toBeGreaterThan(190);
  });
});

describe("isExpired", () => {
  it("treats null as not expired", () => {
    expect(isExpired(null)).toBe(false);
  });
  it("returns true for past dates", () => {
    expect(isExpired("2020-01-01T00:00:00Z", new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });
  it("returns false for future dates", () => {
    expect(isExpired("2099-01-01T00:00:00Z", new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("canRedeemInvite", () => {
  const baseInvite = {
    status: "unused" as const,
    expires_at: null,
    email: null,
  };

  it("allows redemption of an unused, unexpired, unrestricted invite", () => {
    const r = canRedeemInvite(baseInvite, "anyone@example.com");
    expect(r.ok).toBe(true);
  });

  it("rejects used invites", () => {
    const r = canRedeemInvite({ ...baseInvite, status: "used" }, "x@example.com");
    expect(r.ok).toBe(false);
  });

  it("rejects revoked invites", () => {
    const r = canRedeemInvite({ ...baseInvite, status: "revoked" }, "x@example.com");
    expect(r.ok).toBe(false);
  });

  it("rejects expired invites", () => {
    const r = canRedeemInvite(
      { ...baseInvite, expires_at: "2020-01-01T00:00:00Z" },
      "x@example.com",
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects when email-locked invite is redeemed by wrong email", () => {
    const r = canRedeemInvite(
      { ...baseInvite, email: "owner@example.com" },
      "stranger@example.com",
    );
    expect(r.ok).toBe(false);
  });

  it("accepts case-insensitive email match", () => {
    const r = canRedeemInvite(
      { ...baseInvite, email: "Owner@Example.com" },
      "owner@example.com",
    );
    expect(r.ok).toBe(true);
  });
});

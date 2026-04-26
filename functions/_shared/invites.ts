import type { InviteCodeRow } from "./types.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,1,0 to reduce confusion

/** Generate a 12-character invite code grouped as XXXX-XXXX-XXXX. */
export function generateInviteCode(rng: Crypto = crypto): string {
  const buf = new Uint8Array(12);
  rng.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < buf.length; i++) {
    s += ALPHABET[buf[i] % ALPHABET.length];
  }
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return t < now.getTime();
}

/** Pure: decide whether an invite row may be redeemed by a given email. */
export function canRedeemInvite(
  invite: Pick<InviteCodeRow, "status" | "expires_at" | "email">,
  byEmail: string,
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (invite.status !== "unused") return { ok: false, reason: `invite is ${invite.status}` };
  if (isExpired(invite.expires_at, now)) return { ok: false, reason: "invite has expired" };
  if (invite.email && invite.email.toLowerCase() !== byEmail.toLowerCase()) {
    return { ok: false, reason: "invite is reserved for a different email" };
  }
  return { ok: true };
}

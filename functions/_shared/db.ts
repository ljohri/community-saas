import type {
  Env,
  MemberRow,
  MembershipPeriodRow,
} from "./types.js";

export function currentYear(date: Date = new Date()): number {
  return date.getUTCFullYear();
}

export async function findMemberByEmail(
  env: Env,
  email: string,
): Promise<MemberRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM members WHERE lower(email) = lower(?) LIMIT 1`,
  )
    .bind(email)
    .first<MemberRow>();
  return row ?? null;
}

export async function findMemberByFirebaseUid(
  env: Env,
  uid: string,
): Promise<MemberRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM members WHERE firebase_uid = ? LIMIT 1`,
  )
    .bind(uid)
    .first<MemberRow>();
  return row ?? null;
}

export async function findMemberById(
  env: Env,
  id: number,
): Promise<MemberRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM members WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<MemberRow>();
  return row ?? null;
}

export async function getCurrentMembershipPeriod(
  env: Env,
  memberId: number,
  year: number = currentYear(),
): Promise<MembershipPeriodRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM membership_periods WHERE member_id = ? AND year = ? LIMIT 1`,
  )
    .bind(memberId, year)
    .first<MembershipPeriodRow>();
  return row ?? null;
}

/**
 * Link a Firebase UID to a members row. We resolve members by email at
 * accept-invite / first-login time, then lock the firebase_uid in. After that,
 * subsequent requests use the UID as the canonical identifier.
 */
export async function attachFirebaseUidIfMissing(
  env: Env,
  memberId: number,
  uid: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE members
     SET firebase_uid = COALESCE(firebase_uid, ?),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(uid, memberId)
    .run();
}

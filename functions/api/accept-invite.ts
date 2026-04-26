import { audit } from "../_shared/audit.js";
import { getBearerToken, verifyFirebaseIdToken } from "../_shared/auth.js";
import {
  attachFirebaseUidIfMissing,
  findMemberByEmail,
  findMemberByFirebaseUid,
} from "../_shared/db.js";
import { canRedeemInvite } from "../_shared/invites.js";
import { badRequest, json, unauthorized } from "../_shared/responses.js";
import type { Env, InviteCodeRow } from "../_shared/types.js";

interface Body {
  code?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearerToken(request);
  if (!token) return unauthorized("missing bearer token");
  const user = await verifyFirebaseIdToken(token, env);
  if (!user) return unauthorized("invalid token");

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return badRequest("invalid JSON body");
  }
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return badRequest("code is required");

  const invite = await env.DB.prepare(
    `SELECT * FROM invite_codes WHERE code = ? LIMIT 1`,
  )
    .bind(code)
    .first<InviteCodeRow>();
  if (!invite) return badRequest("invalid invite code");

  const decision = canRedeemInvite(invite, user.email);
  if (!decision.ok) return badRequest(decision.reason);

  // Try to find an existing member to update; otherwise create one.
  // We never trust an email from the body — only the verified Firebase email.
  let member =
    (await findMemberByFirebaseUid(env, user.uid)) ??
    (await findMemberByEmail(env, user.email));

  const nowIso = new Date().toISOString();

  if (!member) {
    const insert = await env.DB.prepare(
      `INSERT INTO members (firebase_uid, email, name, status, role)
       VALUES (?, ?, ?, 'active', ?)`,
    )
      .bind(user.uid, user.email, null, invite.role)
      .run();
    const newId = Number(insert.meta.last_row_id);
    member = {
      id: newId,
      firebase_uid: user.uid,
      email: user.email,
      name: null,
      status: "active",
      role: invite.role,
      region: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
  } else {
    if (!member.firebase_uid) {
      await attachFirebaseUidIfMissing(env, member.id, user.uid);
      member.firebase_uid = user.uid;
    }
    // Promote invited -> active and adopt the invite's role if it's a higher
    // privilege (e.g. invited member redeeming an admin invite).
    const newStatus = member.status === "active" ? "active" : "active";
    const newRole =
      invite.role === "admin" || member.role === "admin" ? "admin" : "member";
    await env.DB.prepare(
      `UPDATE members SET status = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    )
      .bind(newStatus, newRole, member.id)
      .run();
    member.status = newStatus;
    member.role = newRole;
  }

  await env.DB.prepare(
    `UPDATE invite_codes
     SET status = 'used', used_by_member_id = ?, used_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(member.id, invite.id)
    .run();

  await audit(env, request, member, "invite.accept", {
    type: "invite_code",
    id: invite.id,
    details: { code: invite.code, role: invite.role },
  });

  return json({
    ok: true,
    member: {
      id: member.id,
      email: member.email,
      role: member.role,
      status: member.status,
    },
  });
};

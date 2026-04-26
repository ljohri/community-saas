import { requireAdmin } from "../../_shared/auth.js";
import { audit } from "../../_shared/audit.js";
import { generateInviteCode } from "../../_shared/invites.js";
import { badRequest, json, notFound } from "../../_shared/responses.js";
import type { Env, InviteCodeRow } from "../../_shared/types.js";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireAdmin(request, env);
  if (r instanceof Response) return r;
  const rows = await env.DB.prepare(
    `SELECT i.*, m.email AS used_by_email
     FROM invite_codes i
     LEFT JOIN members m ON m.id = i.used_by_member_id
     ORDER BY i.created_at DESC`,
  ).all<InviteCodeRow & { used_by_email: string | null }>();
  return json({ invites: rows.results ?? [] });
};

interface CreateBody {
  email?: string | null;
  role?: "member" | "admin";
  expiresAt?: string | null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireAdmin(request, env);
  if (r instanceof Response) return r;
  const body = ((await safeJson(request)) ?? {}) as CreateBody;
  const role = body.role === "admin" ? "admin" : "member";
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const expiresAt = body.expiresAt ?? null;

  // Generate up to 5 times in the unlikely case of collision.
  let code = "";
  let inserted: D1Result | null = null;
  for (let i = 0; i < 5 && !inserted; i++) {
    code = generateInviteCode();
    try {
      inserted = await env.DB.prepare(
        `INSERT INTO invite_codes (code, email, role, status, expires_at, created_by_member_id)
         VALUES (?, ?, ?, 'unused', ?, ?)`,
      )
        .bind(code, email, role, expiresAt, r.member?.id ?? null)
        .run();
    } catch {
      inserted = null;
    }
  }
  if (!inserted) return badRequest("could not allocate invite code");

  const id = Number(inserted.meta.last_row_id);
  await audit(env, request, r.member, "admin.invites.create", {
    type: "invite_code",
    id,
    details: { code, role, email, expiresAt },
  });

  return json(
    {
      ok: true,
      id,
      code,
      acceptUrl: `/accept-invite?code=${encodeURIComponent(code)}`,
    },
    { status: 201 },
  );
};

interface PatchBody {
  id?: number;
  status?: "unused" | "revoked";
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireAdmin(request, env);
  if (r instanceof Response) return r;
  const body = ((await safeJson(request)) ?? {}) as PatchBody;
  if (!body.id) return badRequest("id required");
  if (body.status !== "revoked") {
    return badRequest("only status='revoked' is supported via PATCH");
  }
  const result = await env.DB.prepare(
    `UPDATE invite_codes SET status = 'revoked' WHERE id = ? AND status = 'unused'`,
  )
    .bind(body.id)
    .run();
  if (!result.success || (result.meta.changes ?? 0) === 0) return notFound("invite not found or not revocable");
  await audit(env, request, r.member, "admin.invites.revoke", {
    type: "invite_code",
    id: body.id,
  });
  return json({ ok: true });
};

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

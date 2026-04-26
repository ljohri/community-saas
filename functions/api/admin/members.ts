import { requireAdmin } from "../../_shared/auth.js";
import { audit } from "../../_shared/audit.js";
import { badRequest, json, notFound } from "../../_shared/responses.js";
import type { Env, MemberRow } from "../../_shared/types.js";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireAdmin(request, env);
  if (r instanceof Response) return r;
  const rows = await env.DB.prepare(
    `SELECT id, firebase_uid, email, name, status, role, region, created_at, updated_at
     FROM members
     ORDER BY created_at DESC`,
  ).all<MemberRow>();
  return json({ members: rows.results ?? [] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireAdmin(request, env);
  if (r instanceof Response) return r;
  const body = (await safeJson(request)) as Partial<MemberRow> | null;
  if (!body || !body.email) return badRequest("email required");
  const email = String(body.email).trim().toLowerCase();
  const name = body.name ?? null;
  const role = body.role === "admin" ? "admin" : "member";
  const status = body.status ?? "invited";
  const region = body.region ?? null;

  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO members (email, name, status, role, region) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(email, name, status, role, region)
      .run();
    const id = Number(inserted.meta.last_row_id);
    await audit(env, request, r.member, "admin.members.create", {
      type: "member",
      id,
      details: { email, role, status },
    });
    return json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return badRequest("could not insert member (email may already exist)", {
      detail: String(err),
    });
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireAdmin(request, env);
  if (r instanceof Response) return r;
  const body = (await safeJson(request)) as
    | (Partial<MemberRow> & { id?: number })
    | null;
  if (!body?.id) return badRequest("id required");

  const updates: string[] = [];
  const binds: unknown[] = [];
  for (const field of ["name", "status", "role", "region"] as const) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      binds.push(body[field]);
    }
  }
  if (updates.length === 0) return badRequest("no fields to update");

  updates.push("updated_at = CURRENT_TIMESTAMP");
  binds.push(body.id);
  const result = await env.DB.prepare(
    `UPDATE members SET ${updates.join(", ")} WHERE id = ?`,
  )
    .bind(...binds)
    .run();
  if (!result.success || (result.meta.changes ?? 0) === 0) return notFound("member not found");

  await audit(env, request, r.member, "admin.members.update", {
    type: "member",
    id: body.id,
    details: body,
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

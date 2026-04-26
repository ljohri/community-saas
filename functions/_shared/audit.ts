import type { Env, MemberRow } from "./types.js";

/** Append an audit_log row. Best-effort; never throws. */
export async function audit(
  env: Env,
  request: Request,
  actor: MemberRow | null,
  action: string,
  target: { type?: string; id?: string | number; details?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const ip = request.headers.get("cf-connecting-ip") ?? "";
    const ipHash = ip ? await sha256(ip) : null;
    const ua = request.headers.get("user-agent") ?? null;
    const details = target.details ? JSON.stringify(target.details) : null;
    await env.DB.prepare(
      `INSERT INTO audit_log
       (actor_member_id, actor_email, action, target_type, target_id, details_json, ip_hash, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        actor?.id ?? null,
        actor?.email ?? null,
        action,
        target.type ?? null,
        target.id != null ? String(target.id) : null,
        details,
        ipHash,
        ua,
      )
      .run();
  } catch (err) {
    console.error("audit_log insert failed", err);
  }
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

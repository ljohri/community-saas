import { requireMember } from "../_shared/auth.js";
import { json } from "../_shared/responses.js";
import type { Env, FinancialTxnRow } from "../_shared/types.js";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireMember(request, env);
  if (r instanceof Response) return r;
  const { member, currentPeriod } = r;
  if (!member) return json({ error: "no member record" }, { status: 404 });

  // Only ever return the caller's own transactions. Admin views go through
  // /api/admin/accounting.
  const txns = await env.DB.prepare(
    `SELECT id, txn_type, direction, amount_cents, txn_date, payment_method, reference, memo, created_at
     FROM financial_transactions
     WHERE member_id = ?
     ORDER BY txn_date DESC, id DESC
     LIMIT 50`,
  )
    .bind(member.id)
    .all<FinancialTxnRow>();

  return json({
    member: {
      id: member.id,
      email: member.email,
      name: member.name,
      status: member.status,
      role: member.role,
      region: member.region,
      created_at: member.created_at,
    },
    currentPeriod,
    transactions: txns.results ?? [],
  });
};

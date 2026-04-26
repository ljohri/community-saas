import { requireAdmin } from "../../_shared/auth.js";
import { audit } from "../../_shared/audit.js";
import { findMemberById } from "../../_shared/db.js";
import { badRequest, json } from "../../_shared/responses.js";
import type { Env } from "../../_shared/types.js";

interface RecordPaymentBody {
  memberId?: number | null;
  txnType?: string;
  direction?: "income" | "expense";
  amountCents?: number;
  txnDate?: string; // YYYY-MM-DD
  paymentMethod?: string | null;
  reference?: string | null;
  memo?: string | null;

  // Optional: also update the member's membership_period for a year and mark fee_paid.
  membershipYear?: number | null;
  markFeePaid?: boolean;
  amountDueCents?: number | null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireAdmin(request, env);
  if (r instanceof Response) return r;

  const body = ((await safeJson(request)) ?? {}) as RecordPaymentBody;
  const direction = body.direction;
  if (direction !== "income" && direction !== "expense") {
    return badRequest("direction must be 'income' or 'expense'");
  }
  const txnType = (body.txnType ?? "").trim();
  if (!txnType) return badRequest("txnType required");

  const amount = Number(body.amountCents ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return badRequest("amountCents must be > 0");

  const txnDate = (body.txnDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) {
    return badRequest("txnDate must be YYYY-MM-DD");
  }

  const memberId = body.memberId ?? null;
  if (memberId) {
    const m = await findMemberById(env, memberId);
    if (!m) return badRequest("member not found");
  }

  // D1 doesn't currently support real transactions in Pages Functions, but
  // batch() is atomic at the storage layer for the included statements.
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    env.DB.prepare(
      `INSERT INTO financial_transactions
        (member_id, txn_type, direction, amount_cents, txn_date, payment_method, reference, memo, recorded_by_member_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      memberId,
      txnType,
      direction,
      amount,
      txnDate,
      body.paymentMethod ?? null,
      body.reference ?? null,
      body.memo ?? null,
      r.member?.id ?? null,
    ),
  );

  if (memberId && body.membershipYear) {
    const year = Number(body.membershipYear);
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      return badRequest("membershipYear invalid");
    }
    const due = body.amountDueCents != null ? Number(body.amountDueCents) : null;
    const markPaid = body.markFeePaid === true;

    // Upsert the membership_periods row for that member+year and increment
    // amount_paid_cents. Mark fee_paid=1 if requested.
    stmts.push(
      env.DB.prepare(
        `INSERT INTO membership_periods
            (member_id, year, valid_from, valid_until, fee_paid, amount_due_cents, amount_paid_cents, notes)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, 0), ?, ?)
         ON CONFLICT(member_id, year) DO UPDATE SET
            amount_paid_cents = amount_paid_cents + excluded.amount_paid_cents,
            amount_due_cents = COALESCE(?, amount_due_cents),
            fee_paid = CASE WHEN ? = 1 THEN 1 ELSE fee_paid END,
            updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        memberId,
        year,
        `${year}-01-01`,
        `${year}-12-31`,
        markPaid ? 1 : 0,
        due,
        direction === "income" ? amount : 0,
        body.memo ?? null,
        due,
        markPaid ? 1 : 0,
      ),
    );
  }

  const results = await env.DB.batch(stmts);
  const txnId = Number(results[0]?.meta.last_row_id ?? 0);

  await audit(env, request, r.member, "admin.payments.record", {
    type: "financial_transaction",
    id: txnId,
    details: {
      memberId,
      txnType,
      direction,
      amountCents: amount,
      txnDate,
      membershipYear: body.membershipYear ?? null,
      markFeePaid: !!body.markFeePaid,
    },
  });

  return json({ ok: true, id: txnId }, { status: 201 });
};

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

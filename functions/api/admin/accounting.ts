import { requireAdmin } from "../../_shared/auth.js";
import { json } from "../../_shared/responses.js";
import type { Env } from "../../_shared/types.js";

interface YearTotal {
  year: number;
  income_cents: number;
  expense_cents: number;
}

interface DuesYear {
  year: number;
  dues_collected_cents: number;
}

interface OutstandingRow {
  member_id: number;
  email: string;
  name: string | null;
  year: number;
  amount_due_cents: number;
  amount_paid_cents: number;
  outstanding_cents: number;
}

interface RecentTxnRow {
  id: number;
  member_id: number | null;
  member_email: string | null;
  txn_type: string;
  direction: "income" | "expense";
  amount_cents: number;
  txn_date: string;
  payment_method: string | null;
  reference: string | null;
  memo: string | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireAdmin(request, env);
  if (r instanceof Response) return r;

  const totalsByYear = await env.DB.prepare(
    `SELECT
        CAST(strftime('%Y', txn_date) AS INTEGER) AS year,
        COALESCE(SUM(CASE WHEN direction = 'income'  THEN amount_cents ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents
     FROM financial_transactions
     GROUP BY year
     ORDER BY year DESC`,
  ).all<YearTotal>();

  const duesByYear = await env.DB.prepare(
    `SELECT year, COALESCE(SUM(amount_paid_cents), 0) AS dues_collected_cents
     FROM membership_periods
     GROUP BY year
     ORDER BY year DESC`,
  ).all<DuesYear>();

  const outstanding = await env.DB.prepare(
    `SELECT
        mp.member_id,
        m.email,
        m.name,
        mp.year,
        mp.amount_due_cents,
        mp.amount_paid_cents,
        (mp.amount_due_cents - mp.amount_paid_cents) AS outstanding_cents
     FROM membership_periods mp
     JOIN members m ON m.id = mp.member_id
     WHERE mp.fee_paid = 0 AND mp.amount_due_cents > mp.amount_paid_cents
     ORDER BY mp.year DESC, m.email ASC`,
  ).all<OutstandingRow>();

  const recent = await env.DB.prepare(
    `SELECT
        ft.id, ft.member_id, m.email AS member_email, ft.txn_type, ft.direction,
        ft.amount_cents, ft.txn_date, ft.payment_method, ft.reference, ft.memo
     FROM financial_transactions ft
     LEFT JOIN members m ON m.id = ft.member_id
     ORDER BY ft.txn_date DESC, ft.id DESC
     LIMIT 100`,
  ).all<RecentTxnRow>();

  return json({
    totalsByYear: totalsByYear.results ?? [],
    duesByYear: duesByYear.results ?? [],
    outstanding: outstanding.results ?? [],
    recentTransactions: recent.results ?? [],
  });
};

import { useEffect, useState } from "react";
import { adminAccounting, type AccountingSummary } from "../../lib/api";
import { formatCents } from "../../lib/format";

export default function AccountingAdmin() {
  const [data, setData] = useState<AccountingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminAccounting()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div className="card error">{error}</div>;
  if (!data) return <div className="card">Loading…</div>;

  const duesByYear = new Map(data.duesByYear.map((d) => [d.year, d.dues_collected_cents]));

  return (
    <>
      <div className="card">
        <h1>Accounting</h1>
        <h2>Totals by year</h2>
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>Income</th>
              <th>Expenses</th>
              <th>Net</th>
              <th>Dues collected</th>
            </tr>
          </thead>
          <tbody>
            {data.totalsByYear.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No transactions yet.</td>
              </tr>
            )}
            {data.totalsByYear.map((y) => (
              <tr key={y.year}>
                <td>{y.year}</td>
                <td>{formatCents(y.income_cents)}</td>
                <td>{formatCents(y.expense_cents)}</td>
                <td>{formatCents(y.income_cents - y.expense_cents)}</td>
                <td>{formatCents(duesByYear.get(y.year) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Outstanding dues</h2>
        {data.outstanding.length === 0 ? (
          <p className="muted">No outstanding dues.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Year</th>
                <th>Due</th>
                <th>Paid</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.outstanding.map((o) => (
                <tr key={`${o.member_id}-${o.year}`}>
                  <td>{o.name ? `${o.name} <${o.email}>` : o.email}</td>
                  <td>{o.year}</td>
                  <td>{formatCents(o.amount_due_cents)}</td>
                  <td>{formatCents(o.amount_paid_cents)}</td>
                  <td>{formatCents(o.outstanding_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Recent transactions</h2>
        {data.recentTransactions.length === 0 ? (
          <p className="muted">No transactions recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Member</th>
                <th>Type</th>
                <th>Direction</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Memo</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTransactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.txn_date}</td>
                  <td>{t.member_email ?? "—"}</td>
                  <td>{t.txn_type}</td>
                  <td>{t.direction}</td>
                  <td>{formatCents(t.amount_cents)}</td>
                  <td>{t.payment_method ?? "—"}</td>
                  <td>{t.reference ?? "—"}</td>
                  <td>{t.memo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

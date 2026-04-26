import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMe } from "../../lib/api";
import { formatCents } from "../../lib/format";
import type { FinancialTxn, Member, MembershipPeriod } from "../../lib/types";

export default function MemberDashboard() {
  const [data, setData] = useState<{
    member: Member;
    currentPeriod: MembershipPeriod | null;
    transactions: FinancialTxn[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div className="card error">{error}</div>;
  if (!data) return <div className="card">Loading…</div>;

  const period = data.currentPeriod;

  return (
    <>
      <div className="card">
        <h1>Members area</h1>
        <p>Hello {data.member.name ?? data.member.email}.</p>
        <p>
          See <Link to="/members/common">Common</Link> for shared content, or{" "}
          <Link to="/members/profile">Profile</Link> to review your details.
        </p>
      </div>

      <div className="card">
        <h2>Current membership period</h2>
        {period ? (
          <table>
            <tbody>
              <tr>
                <th>Year</th>
                <td>{period.year}</td>
              </tr>
              <tr>
                <th>Valid</th>
                <td>
                  {period.valid_from} → {period.valid_until}
                </td>
              </tr>
              <tr>
                <th>Fee paid</th>
                <td>{period.fee_paid ? "Yes" : "No"}</td>
              </tr>
              <tr>
                <th>Amount due</th>
                <td>{formatCents(period.amount_due_cents)}</td>
              </tr>
              <tr>
                <th>Amount paid</th>
                <td>{formatCents(period.amount_paid_cents)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="muted">No membership period on file for this year.</p>
        )}
      </div>

      <div className="card">
        <h2>My recent transactions</h2>
        {data.transactions.length === 0 ? (
          <p className="muted">No transactions yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Direction</th>
                <th>Amount</th>
                <th>Memo</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.txn_date}</td>
                  <td>{t.txn_type}</td>
                  <td>{t.direction}</td>
                  <td>{formatCents(t.amount_cents)}</td>
                  <td>{t.memo ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

import { FormEvent, useEffect, useState } from "react";
import { adminListMembers, adminRecordPayment } from "../../lib/api";
import { todayIso } from "../../lib/format";
import type { Member } from "../../lib/types";

export default function RecordPayment() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminListMembers()
      .then((r) => setMembers(r.members))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const f = new FormData(e.currentTarget);
    const amountDollars = parseFloat((f.get("amount") as string) || "0");
    if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
      setError("Amount must be > 0");
      return;
    }
    const amountCents = Math.round(amountDollars * 100);
    const memberIdRaw = (f.get("memberId") as string) || "";
    const memberId = memberIdRaw ? Number(memberIdRaw) : null;
    const yearRaw = (f.get("membershipYear") as string) || "";
    const membershipYear = yearRaw ? Number(yearRaw) : null;
    const dueRaw = (f.get("amountDue") as string) || "";
    const amountDueCents = dueRaw ? Math.round(parseFloat(dueRaw) * 100) : null;
    setBusy(true);
    try {
      await adminRecordPayment({
        memberId,
        txnType: (f.get("txnType") as string) || "membership_dues",
        direction: (f.get("direction") as "income" | "expense") || "income",
        amountCents,
        txnDate: (f.get("txnDate") as string) || todayIso(),
        paymentMethod: ((f.get("paymentMethod") as string) || "").trim() || null,
        reference: ((f.get("reference") as string) || "").trim() || null,
        memo: ((f.get("memo") as string) || "").trim() || null,
        membershipYear,
        markFeePaid: f.get("markFeePaid") === "on",
        amountDueCents,
      });
      setOk("Recorded.");
      (e.currentTarget as HTMLFormElement).reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1>Record payment / transaction</h1>
      <p className="muted">
        Records to <code>financial_transactions</code>. If you specify a
        member and membership year, also updates that member's{" "}
        <code>membership_periods</code> row.
      </p>
      <form onSubmit={onSubmit}>
        <div className="row">
          <label>
            <span>Member</span>
            <select name="memberId" defaultValue="">
              <option value="">— None (general expense/income) —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.email}
                  {m.name ? ` (${m.name})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Type</span>
            <input name="txnType" defaultValue="membership_dues" required />
          </label>
        </div>
        <div className="row">
          <label>
            <span>Direction</span>
            <select name="direction" defaultValue="income">
              <option value="income">income</option>
              <option value="expense">expense</option>
            </select>
          </label>
          <label>
            <span>Amount (e.g. 50.00)</span>
            <input name="amount" type="number" step="0.01" min="0" required />
          </label>
          <label>
            <span>Date</span>
            <input name="txnDate" type="date" defaultValue={todayIso()} required />
          </label>
        </div>
        <div className="row">
          <label>
            <span>Payment method</span>
            <input name="paymentMethod" placeholder="cash / bank / paypal" />
          </label>
          <label>
            <span>Reference</span>
            <input name="reference" placeholder="check #, tx id, etc." />
          </label>
        </div>
        <label>
          <span>Memo</span>
          <input name="memo" />
        </label>

        <fieldset style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "0.75rem" }}>
          <legend>Apply to membership period (optional)</legend>
          <div className="row">
            <label>
              <span>Year</span>
              <input name="membershipYear" type="number" placeholder={String(new Date().getFullYear())} />
            </label>
            <label>
              <span>Amount due (set or update)</span>
              <input name="amountDue" type="number" step="0.01" min="0" />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input name="markFeePaid" type="checkbox" style={{ width: "auto" }} />
              <span style={{ margin: 0 }}>Mark fee_paid = true</span>
            </label>
          </div>
        </fieldset>

        <button className="btn primary" disabled={busy} style={{ marginTop: "0.75rem" }}>
          {busy ? "Recording…" : "Record"}
        </button>
        {ok && <span className="ok" style={{ marginLeft: "1rem" }}>{ok}</span>}
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

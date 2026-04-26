import { useEffect, useState } from "react";
import { fetchMe } from "../../lib/api";
import type { Member, MembershipPeriod } from "../../lib/types";

export default function Profile() {
  const [data, setData] = useState<{
    member: Member;
    currentPeriod: MembershipPeriod | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe()
      .then((d) => setData({ member: d.member, currentPeriod: d.currentPeriod }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div className="card error">{error}</div>;
  if (!data) return <div className="card">Loading…</div>;

  const m = data.member;
  return (
    <div className="card">
      <h1>My profile</h1>
      <p className="muted">
        These are the details we have on file for you. Contact an admin to
        update them.
      </p>
      <table>
        <tbody>
          <tr><th>Name</th><td>{m.name ?? "—"}</td></tr>
          <tr><th>Email</th><td>{m.email}</td></tr>
          <tr><th>Region</th><td>{m.region ?? "—"}</td></tr>
          <tr>
            <th>Status</th>
            <td><span className={`badge ${m.status}`}>{m.status}</span></td>
          </tr>
          <tr>
            <th>Role</th>
            <td><span className={`badge ${m.role}`}>{m.role}</span></td>
          </tr>
          <tr><th>Member since</th><td>{m.created_at}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

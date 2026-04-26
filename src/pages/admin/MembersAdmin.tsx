import { FormEvent, useEffect, useState } from "react";
import {
  adminCreateMember,
  adminListMembers,
  adminUpdateMember,
} from "../../lib/api";
import type { Member } from "../../lib/types";

export default function MembersAdmin() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    adminListMembers()
      .then((r) => setMembers(r.members))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    if (!email) return;
    setBusy(true);
    try {
      await adminCreateMember({
        email,
        name: (f.get("name") as string) || null,
        role: (f.get("role") as "member" | "admin") ?? "member",
        status: (f.get("status") as Member["status"]) ?? "invited",
        region: (f.get("region") as string) || null,
      });
      (e.currentTarget as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function update(id: number, patch: Partial<Member>) {
    setBusy(true);
    setError(null);
    try {
      await adminUpdateMember(id, patch);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h1>Members</h1>
        {error && <p className="error">{error}</p>}
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Status</th>
              <th>Role</th>
              <th>Region</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.email}</td>
                <td>{m.name ?? "—"}</td>
                <td>
                  <select
                    defaultValue={m.status}
                    onChange={(e) => update(m.id, { status: e.target.value as Member["status"] })}
                    disabled={busy}
                  >
                    <option value="invited">invited</option>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="revoked">revoked</option>
                  </select>
                </td>
                <td>
                  <select
                    defaultValue={m.role}
                    onChange={(e) => update(m.id, { role: e.target.value as Member["role"] })}
                    disabled={busy}
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td>{m.region ?? "—"}</td>
                <td>{m.created_at}</td>
                <td>—</td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">No members yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Create member</h2>
        <form onSubmit={onCreate}>
          <div className="row">
            <label>
              <span>Email</span>
              <input name="email" type="email" required />
            </label>
            <label>
              <span>Name</span>
              <input name="name" />
            </label>
          </div>
          <div className="row">
            <label>
              <span>Role</span>
              <select name="role" defaultValue="member">
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue="invited">
                <option value="invited">invited</option>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="revoked">revoked</option>
              </select>
            </label>
            <label>
              <span>Region</span>
              <input name="region" />
            </label>
          </div>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Create member"}
          </button>
        </form>
      </div>
    </>
  );
}

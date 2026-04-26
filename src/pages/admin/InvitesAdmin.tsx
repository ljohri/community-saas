import { FormEvent, useEffect, useState } from "react";
import {
  adminCreateInvite,
  adminListInvites,
  adminRevokeInvite,
} from "../../lib/api";
import type { InviteCode } from "../../lib/types";

interface InviteWithUsedBy extends InviteCode {
  used_by_email?: string | null;
}

export default function InvitesAdmin() {
  const [invites, setInvites] = useState<InviteWithUsedBy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastCreated, setLastCreated] =
    useState<{ code: string; acceptUrl: string } | null>(null);

  const load = () =>
    adminListInvites()
      .then((r) => setInvites(r.invites as InviteWithUsedBy[]))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const created = await adminCreateInvite({
        email: ((f.get("email") as string) || "").trim() || null,
        role: ((f.get("role") as "member" | "admin") ?? "member"),
        expiresAt: ((f.get("expiresAt") as string) || "").trim() || null,
      });
      setLastCreated({ code: created.code, acceptUrl: created.acceptUrl });
      (e.currentTarget as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    setBusy(true);
    setError(null);
    try {
      await adminRevokeInvite(id);
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
        <h1>Invites</h1>
        {error && <p className="error">{error}</p>}
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Used by</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id}>
                <td><code>{i.code}</code></td>
                <td>{i.email ?? "—"}</td>
                <td>{i.role}</td>
                <td><span className={`badge ${i.status}`}>{i.status}</span></td>
                <td>{i.expires_at ?? "—"}</td>
                <td>{i.used_by_email ?? "—"}</td>
                <td>{i.created_at}</td>
                <td>
                  {i.status === "unused" ? (
                    <button className="btn danger" onClick={() => revoke(i.id)} disabled={busy}>
                      Revoke
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {invites.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">No invites yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Create invite</h2>
        <form onSubmit={onCreate}>
          <div className="row">
            <label>
              <span>Email (optional, restricts redemption to this email)</span>
              <input name="email" type="email" />
            </label>
            <label>
              <span>Role</span>
              <select name="role" defaultValue="member">
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label>
              <span>Expires (ISO date, optional)</span>
              <input name="expiresAt" placeholder="2026-12-31" />
            </label>
          </div>
          <button className="btn primary" disabled={busy}>
            {busy ? "Creating…" : "Create invite"}
          </button>
        </form>
        {lastCreated && (
          <p className="ok" style={{ marginTop: "0.75rem" }}>
            New invite: <code>{lastCreated.code}</code>
            <br />
            Share this link:{" "}
            <a href={lastCreated.acceptUrl}>{window.location.origin}{lastCreated.acceptUrl}</a>
          </p>
        )}
      </div>
    </>
  );
}

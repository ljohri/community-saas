import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { acceptInvite, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const { user, signIn, configured, refreshSession } = useAuth();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = params.get("code");
    if (c) setCode(c);
  }, [params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!user) {
      setError("You must sign in first.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await acceptInvite(code.trim());
      setResult(`Welcome — your account is now ${r.member.status}.`);
      await refreshSession();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 540 }}>
      <h1>Accept invite</h1>
      <p>
        Sign in with the email your invite was issued to, then paste your
        invite code below.
      </p>

      {!user && (
        <button
          className="btn primary"
          disabled={!configured}
          onClick={() => signIn().catch((e) => setError(String(e)))}
        >
          Sign in with Google
        </button>
      )}

      {user && (
        <form onSubmit={onSubmit} style={{ marginTop: "0.5rem" }}>
          <label>
            <span>Invite code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              required
            />
          </label>
          <button className="btn primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Accept invite"}
          </button>
        </form>
      )}

      {result && (
        <p className="ok" style={{ marginTop: "1rem" }}>
          {result} <Link to="/members">Go to members area →</Link>
        </p>
      )}
      {error && (
        <p className="error" style={{ marginTop: "1rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}

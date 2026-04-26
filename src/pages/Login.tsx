import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { user, signIn, configured, refreshSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  const next = new URLSearchParams(location.search).get("next") ?? "/";

  useEffect(() => {
    if (user) {
      refreshSession().finally(() => navigate(next, { replace: true }));
    }
  }, [user, navigate, next, refreshSession]);

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h1>Sign in</h1>
      {!configured && (
        <p className="error">
          Firebase is not configured. Copy <code>.env.example</code> to{" "}
          <code>.env</code> and set the <code>VITE_FIREBASE_*</code> values.
        </p>
      )}
      <p>Sign in with your Google account to continue.</p>
      <button
        className="btn primary"
        disabled={!configured}
        onClick={async () => {
          setError(null);
          try {
            await signIn();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        Sign in with Google
      </button>
      {error && <p className="error" style={{ marginTop: "1rem" }}>{error}</p>}
    </div>
  );
}

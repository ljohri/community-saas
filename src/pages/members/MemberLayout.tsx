import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth";

export default function MemberLayout() {
  const { loading, user, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="card">Checking your membership…</div>;
  }

  if (!user) {
    return (
      <div className="card">
        <h1>Sign in required</h1>
        <p>
          You need to sign in to access the members area.{" "}
          <a href={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</a>.
        </p>
      </div>
    );
  }

  if (!session?.allowedMember) {
    return (
      <div className="card">
        <h1>Membership active payment required</h1>
        <p>
          Your account is signed in as <strong>{user.email}</strong>, but our
          records do not show an active paid membership for {session?.currentYear}.
        </p>
        <p className="muted">
          If you have just paid, please ask an admin to record it. If you are
          new, head to <a href="/accept-invite">Accept invite</a>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <nav style={{ marginBottom: "1rem", display: "flex", gap: "1rem" }}>
        <NavLink to="/members" end>Dashboard</NavLink>
        <NavLink to="/members/common">Common</NavLink>
        <NavLink to="/members/profile">Profile</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

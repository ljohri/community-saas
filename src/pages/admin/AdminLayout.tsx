import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth";

export default function AdminLayout() {
  const { loading, user, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="card">Checking admin access…</div>;
  }
  if (!user) {
    return (
      <div className="card">
        <h1>Sign in required</h1>
        <p>
          <a href={`/login?next=${encodeURIComponent(location.pathname)}`}>
            Sign in
          </a>{" "}
          to continue.
        </p>
      </div>
    );
  }
  if (!session?.allowedAdmin) {
    return (
      <div className="card">
        <h1>Admin access required</h1>
        <p>
          You are signed in as <strong>{user.email}</strong>, but this account
          does not have admin role.
        </p>
      </div>
    );
  }

  return (
    <div>
      <nav style={{ marginBottom: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <NavLink to="/admin" end>Overview</NavLink>
        <NavLink to="/admin/members">Members</NavLink>
        <NavLink to="/admin/invites">Invites</NavLink>
        <NavLink to="/admin/record-payment">Record payment</NavLink>
        <NavLink to="/admin/accounting">Accounting</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

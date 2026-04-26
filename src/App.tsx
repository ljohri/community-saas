import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Home from "./pages/Home";
import About from "./pages/About";
import Events from "./pages/Events";
import Membership from "./pages/Membership";
import Login from "./pages/Login";
import AcceptInvite from "./pages/AcceptInvite";
import MemberLayout from "./pages/members/MemberLayout";
import MemberDashboard from "./pages/members/MemberDashboard";
import CommonMemberPage from "./pages/members/CommonMemberPage";
import Profile from "./pages/members/Profile";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import MembersAdmin from "./pages/admin/MembersAdmin";
import AccountingAdmin from "./pages/admin/AccountingAdmin";
import InvitesAdmin from "./pages/admin/InvitesAdmin";
import RecordPayment from "./pages/admin/RecordPayment";

export default function App() {
  const { user, signOut, session } = useAuth();
  const appName = import.meta.env.VITE_APP_NAME ?? "Community Site";

  return (
    <>
      <header className="site">
        <div className="container">
          <NavLink to="/" className="brand">
            {appName}
          </NavLink>
          <nav>
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/events">Events</NavLink>
            <NavLink to="/membership">Membership</NavLink>
            {session?.allowedMember && <NavLink to="/members">Members</NavLink>}
            {session?.allowedAdmin && <NavLink to="/admin">Admin</NavLink>}
            {user ? (
              <>
                <span className="muted" title={user.email ?? ""}>
                  {user.email}
                </span>
                <button className="btn" onClick={() => signOut()}>
                  Sign out
                </button>
              </>
            ) : (
              <NavLink to="/login">Sign in</NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/events" element={<Events />} />
          <Route path="/membership" element={<Membership />} />
          <Route path="/login" element={<Login />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />

          <Route path="/members" element={<MemberLayout />}>
            <Route index element={<MemberDashboard />} />
            <Route path="common" element={<CommonMemberPage />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="members" element={<MembersAdmin />} />
            <Route path="accounting" element={<AccountingAdmin />} />
            <Route path="invites" element={<InvitesAdmin />} />
            <Route path="record-payment" element={<RecordPayment />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="site">
        <div className="container">
          {appName} — built on Cloudflare Pages, D1, and Firebase Auth.
        </div>
      </footer>
    </>
  );
}

function NotFound() {
  return (
    <div className="card">
      <h1>Not found</h1>
      <p>That page does not exist.</p>
    </div>
  );
}

import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="card">
      <h1>Welcome</h1>
      <p>
        This is the public landing page for our small community. Public pages
        like <Link to="/about">About</Link> and{" "}
        <Link to="/events">Events</Link> are open to everyone.
      </p>
      <p className="muted">
        Members in good standing can access the{" "}
        <Link to="/members">members area</Link>. If you have an invite code,
        head to <Link to="/accept-invite">Accept invite</Link>.
      </p>
    </div>
  );
}

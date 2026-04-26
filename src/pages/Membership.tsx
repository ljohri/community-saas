import { Link } from "react-router-dom";

export default function Membership() {
  return (
    <div className="card">
      <h1>Membership</h1>
      <p>
        Membership is invite-only and renewed annually. Active members in good
        standing for the current year have access to the members area.
      </p>
      <h2>How to join</h2>
      <ol>
        <li>Receive an invite code from an admin.</li>
        <li>
          Open <Link to="/accept-invite">Accept invite</Link>, sign in with the
          email the invite was issued to, and paste the code.
        </li>
        <li>Pay the annual fee. An admin will record it manually.</li>
      </ol>
      <p className="muted">
        Payments are not processed online — they are recorded by the admin
        after they have been received offline.
      </p>
    </div>
  );
}

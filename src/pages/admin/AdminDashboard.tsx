import { Link } from "react-router-dom";

export default function AdminDashboard() {
  return (
    <div className="card">
      <h1>Admin overview</h1>
      <p>Use the navigation above to manage the community.</p>
      <ul>
        <li><Link to="/admin/members">Members</Link> — list, create, update.</li>
        <li><Link to="/admin/invites">Invites</Link> — issue and revoke codes.</li>
        <li><Link to="/admin/record-payment">Record payment</Link> — log a transaction or fee.</li>
        <li><Link to="/admin/accounting">Accounting</Link> — totals, dues, recent activity.</li>
      </ul>
    </div>
  );
}

export default function About() {
  return (
    <div className="card">
      <h1>About</h1>
      <p>
        We are a small community of around 100 members. This site exists so
        members can stay in touch and so admins can keep light-touch records of
        membership and finances.
      </p>
      <p className="muted">
        No private member or financial data is stored in this public site's
        static files; everything sensitive is fetched through authenticated
        APIs.
      </p>
    </div>
  );
}

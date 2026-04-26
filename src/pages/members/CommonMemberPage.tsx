import { useEffect, useState } from "react";
import { fetchMemberContent } from "../../lib/api";

export default function CommonMemberPage() {
  const [content, setContent] = useState<{
    headline: string;
    sections: { title: string; body: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMemberContent()
      .then(setContent)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div className="card error">{error}</div>;
  if (!content) return <div className="card">Loading…</div>;

  return (
    <>
      <div className="card">
        <h1>{content.headline}</h1>
      </div>
      {content.sections.map((s, i) => (
        <div key={i} className="card">
          <h2>{s.title}</h2>
          <p>{s.body}</p>
        </div>
      ))}
    </>
  );
}

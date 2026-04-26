import { requireMember } from "../_shared/auth.js";
import { json } from "../_shared/responses.js";
import type { Env } from "../_shared/types.js";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const r = await requireMember(request, env);
  if (r instanceof Response) return r;

  // This is the kind of content that must NEVER live in the static bundle —
  // it's behind the active+paid gate. Replace this with whatever you actually
  // want to show (e.g. WhatsApp link, calendar, internal docs).
  return json({
    headline: `Welcome back, ${r.member?.name ?? r.member?.email ?? "member"}`,
    sections: [
      {
        title: "Common member content",
        body:
          "This area is restricted to members in good standing for the current year. " +
          "Use it for internal notices, contact lists, the chat invite link, etc.",
      },
      {
        title: "Upcoming gatherings",
        body:
          "Admins can update this through future endpoints; for now this is a placeholder.",
      },
    ],
  });
};

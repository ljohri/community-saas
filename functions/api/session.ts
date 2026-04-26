import { decideAccess } from "../_shared/access.js";
import { currentYear } from "../_shared/db.js";
import { getBearerToken, verifyFirebaseIdToken } from "../_shared/auth.js";
import {
  findMemberByEmail,
  findMemberByFirebaseUid,
  attachFirebaseUidIfMissing,
  getCurrentMembershipPeriod,
} from "../_shared/db.js";
import { json } from "../_shared/responses.js";
import type { Env, SessionInfo } from "../_shared/types.js";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const year = currentYear();

  const token = getBearerToken(request);
  if (!token) {
    const anon: SessionInfo = {
      authenticated: false,
      uid: null,
      email: null,
      role: null,
      memberStatus: null,
      hasActiveMembership: false,
      feePaid: false,
      allowedMember: false,
      allowedAdmin: false,
      currentYear: year,
    };
    return json(anon);
  }

  const user = await verifyFirebaseIdToken(token, env);
  if (!user) {
    const anon: SessionInfo = {
      authenticated: false,
      uid: null,
      email: null,
      role: null,
      memberStatus: null,
      hasActiveMembership: false,
      feePaid: false,
      allowedMember: false,
      allowedAdmin: false,
      currentYear: year,
    };
    return json(anon);
  }

  let member = await findMemberByFirebaseUid(env, user.uid);
  if (!member) {
    member = await findMemberByEmail(env, user.email);
    if (member && !member.firebase_uid) {
      await attachFirebaseUidIfMissing(env, member.id, user.uid);
      member.firebase_uid = user.uid;
    }
  }

  const period = member
    ? await getCurrentMembershipPeriod(env, member.id, year)
    : null;

  const session = decideAccess({
    authenticated: true,
    uid: user.uid,
    email: user.email,
    member,
    currentPeriod: period,
    currentYear: year,
  });

  return json(session);
};

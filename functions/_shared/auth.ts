import { jwtVerify, importX509, type JWTPayload } from "jose";
import { decideAccess } from "./access.js";
import {
  attachFirebaseUidIfMissing,
  currentYear,
  findMemberByEmail,
  findMemberByFirebaseUid,
  getCurrentMembershipPeriod,
} from "./db.js";
import { forbidden, unauthorized } from "./responses.js";
import type {
  Env,
  FirebaseUser,
  MemberRow,
  MembershipPeriodRow,
  SessionInfo,
} from "./types.js";

const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

interface CertCacheEntry {
  keys: Map<string, CryptoKey>;
  expiresAt: number;
}

let certCache: CertCacheEntry | null = null;

/**
 * Fetches Firebase's PEM-style x509 certs (kid -> CryptoKey) and caches them
 * until max-age expires. Cloudflare's edge cache + this in-memory map mean
 * verifying a token is normally just a CPU-bound JWT verify.
 */
async function getFirebaseKeys(): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) {
    return certCache.keys;
  }
  const res = await fetch(FIREBASE_CERTS_URL, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) {
    throw new Error(`failed to fetch firebase certs: ${res.status}`);
  }
  const cacheControl = res.headers.get("cache-control") ?? "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? Math.max(60, parseInt(maxAgeMatch[1], 10)) : 3600;

  const certs = (await res.json()) as Record<string, string>;
  const keys = new Map<string, CryptoKey>();
  for (const [kid, pem] of Object.entries(certs)) {
    keys.set(kid, await importX509(pem, "RS256"));
  }
  certCache = { keys, expiresAt: now + maxAge * 1000 };
  return keys;
}

export function getBearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Verify a Firebase ID token using the public x509 certs.
 * Validates: signature (RS256), issuer, audience, exp, iat, sub, auth_time.
 * Returns the resolved user identity, or null on any failure.
 */
export async function verifyFirebaseIdToken(
  token: string,
  env: Env,
): Promise<FirebaseUser | null> {
  if (!env.FIREBASE_PROJECT_ID) {
    console.error("FIREBASE_PROJECT_ID is not configured");
    return null;
  }
  let keys: Map<string, CryptoKey>;
  try {
    keys = await getFirebaseKeys();
  } catch (err) {
    console.error("could not load firebase certs", err);
    return null;
  }

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(
      token,
      async (header) => {
        if (!header.kid) throw new Error("missing kid");
        const key = keys.get(header.kid);
        if (!key) {
          // The cache may be stale (key rotation) — invalidate and retry once.
          certCache = null;
          const refreshed = await getFirebaseKeys();
          const k = refreshed.get(header.kid);
          if (!k) throw new Error("unknown kid");
          return k;
        }
        return key;
      },
      {
        issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
        audience: env.FIREBASE_PROJECT_ID,
        algorithms: ["RS256"],
      },
    );
    payload = result.payload;
  } catch (err) {
    return null;
  }

  // Per Firebase spec: sub must be non-empty and equal token's user id.
  const uid = (payload.sub ?? payload["user_id"]) as string | undefined;
  const email = payload["email"] as string | undefined;
  const emailVerified = !!payload["email_verified"];
  const authTime = payload["auth_time"] as number | undefined;
  if (!uid || !email) return null;
  if (typeof authTime !== "number" || authTime > Math.floor(Date.now() / 1000)) {
    return null;
  }

  return { uid, email: email.toLowerCase(), emailVerified };
}

export interface ResolvedUser {
  user: FirebaseUser;
  member: MemberRow | null;
  currentPeriod: MembershipPeriodRow | null;
  session: SessionInfo;
}

/**
 * Verify the bearer token and load DB-side facts (member row, membership
 * period, access decision). Does not enforce any gate by itself.
 */
export async function requireUser(
  request: Request,
  env: Env,
): Promise<ResolvedUser | Response> {
  const token = getBearerToken(request);
  if (!token) return unauthorized("missing bearer token");
  const user = await verifyFirebaseIdToken(token, env);
  if (!user) return unauthorized("invalid token");

  let member = await findMemberByFirebaseUid(env, user.uid);
  if (!member) {
    // Fall back to email — this happens the first time a user logs in
    // before the firebase_uid column has been linked to their members row.
    member = await findMemberByEmail(env, user.email);
    if (member && !member.firebase_uid) {
      await attachFirebaseUidIfMissing(env, member.id, user.uid);
      member.firebase_uid = user.uid;
    }
  }

  const year = currentYear();
  const currentPeriod = member
    ? await getCurrentMembershipPeriod(env, member.id, year)
    : null;

  const session = decideAccess({
    authenticated: true,
    uid: user.uid,
    email: user.email,
    member,
    currentPeriod,
    currentYear: year,
  });

  return { user, member, currentPeriod, session };
}

export async function requireMember(
  request: Request,
  env: Env,
): Promise<ResolvedUser | Response> {
  const r = await requireUser(request, env);
  if (r instanceof Response) return r;
  if (!r.session.allowedMember) {
    return forbidden("active paid membership required");
  }
  return r;
}

export async function requireAdmin(
  request: Request,
  env: Env,
): Promise<ResolvedUser | Response> {
  const r = await requireUser(request, env);
  if (r instanceof Response) return r;
  if (!r.session.allowedAdmin) return forbidden("admin access required");
  return r;
}

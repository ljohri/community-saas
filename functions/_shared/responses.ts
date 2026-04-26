export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

export function error(status: number, message: string, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...(extra ?? {}) }, { status });
}

export const unauthorized = (msg = "unauthorized") => error(401, msg);
export const forbidden = (msg = "forbidden") => error(403, msg);
export const badRequest = (msg = "bad request", extra?: Record<string, unknown>) =>
  error(400, msg, extra);
export const notFound = (msg = "not found") => error(404, msg);
export const serverError = (msg = "internal error") => error(500, msg);

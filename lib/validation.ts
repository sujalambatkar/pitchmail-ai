/** Shared request-body limits and helpers for API routes. */

export const MAX_BODY_BYTES = 50_000;
export const MAX_OFFER_LENGTH = 1_000;
export const MAX_PROFILE_LENGTH = 6_000;
export const MAX_REPLY_LENGTH = 4_000;
export const MAX_TOKEN_LENGTH = 300;

/** Rejects requests whose declared Content-Length exceeds the limit, before parsing. */
export function bodyTooLarge(req: Request, max: number = MAX_BODY_BYTES): boolean {
  const len = Number(req.headers.get("content-length") ?? 0);
  return Number.isFinite(len) && len > max;
}

export function tooLong(value: string, max: number): boolean {
  return value.length > max;
}

/**
 * Split out from session.ts so middleware.ts (Edge runtime) can import this constant
 * without pulling in session.ts's Node-only dependencies (crypto, the pg-backed db
 * client) into the Edge bundle.
 */
export const SESSION_COOKIE_NAME = "sm_session";

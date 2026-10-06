/**
 * Frontend configuration read from NEXT_PUBLIC_ environment variables.
 *
 * Called by: lib/api.ts now; lib/ws.ts and the WebRTC hooks from Phase 5.
 * Every env lookup lives here so the rest of the app imports plain constants.
 */

// INTERVIEW: Next.js replaces `process.env.NEXT_PUBLIC_X` with its literal value at build
// time. That only works when the name is written out in full like below. Destructuring
// (`const { NEXT_PUBLIC_X } = process.env`) or `process.env[name]` is NOT replaced and
// would be `undefined` in the browser.

/** Fallback used when no .env.local exists, matching the default uvicorn port. */
const DEFAULT_API_URL = "http://localhost:8000";
const DEFAULT_WS_URL = "ws://localhost:8000";

/** Remove a trailing slash so `${API_URL}/api/health` never becomes `//api/health`. */
function withoutTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export const API_URL = withoutTrailingSlash(process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL);

export const WS_URL = withoutTrailingSlash(process.env.NEXT_PUBLIC_WS_URL || DEFAULT_WS_URL);

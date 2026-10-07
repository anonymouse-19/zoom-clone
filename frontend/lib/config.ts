/**
 * Frontend configuration read from NEXT_PUBLIC_ environment variables.
 *
 * Called by: lib/api.ts (REST), lib/roomProtocol.ts (WebSocket URL), lib/peerLink.ts (ICE).
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

/**
 * Servers that help two browsers find a network path to each other (WebRTC "ICE").
 *
 * A STUN server only answers "this is your public address", so it's cheap and public
 * ones are free. It's enough when at least one side can accept incoming connections,
 * which covers most home and office networks. Very strict networks (some corporate or
 * mobile ones) also need a TURN server, which relays the video itself. It's optional:
 * set NEXT_PUBLIC_TURN_URL (e.g. a free metered.ca plan) to add one (docs/DECISIONS.md D-055).
 *
 * Note: anything NEXT_PUBLIC_ is visible to every visitor, so these TURN credentials are
 * public. That's normal for a free static TURN plan; a production app would hand out
 * short-lived TURN credentials from the backend instead.
 */
const STUN_SERVER: RTCIceServer = { urls: "stun:stun.l.google.com:19302" };
const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL || "";
const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME || "";
const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "";

function buildIceServers(): RTCIceServer[] {
  if (TURN_URL === "") {
    return [STUN_SERVER];
  }
  const turnServer = { urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL };
  return [STUN_SERVER, turnServer];
}

export const ICE_SERVERS: RTCIceServer[] = buildIceServers();

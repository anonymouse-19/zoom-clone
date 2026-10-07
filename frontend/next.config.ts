import type { NextConfig } from "next";

/**
 * Security headers sent with every page (docs/DECISIONS.md D-090).
 * - No other site may show our pages in a frame, so nobody can trick a user into
 *   clicking "End meeting" or "Delete" through an invisible overlay ("clickjacking").
 * - Browsers must not guess file types (a downloaded file can't be run as a script).
 * - Links to other sites carry only our origin, never a full URL with an invite token.
 * - Camera, microphone and screen capture may be used by this site only.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

/**
 * Where the browser keeps its sign-in token: localStorage, so it survives closing the tab.
 *
 * Called by: lib/api.ts (adds it to every request) and hooks/useAuth.ts (saves it on
 * login, removes it on logout).
 *
 * INTERVIEW: why not a cookie? The site (Vercel) and the API (Render) are on different
 * domains, and browsers increasingly block cookies sent across sites. A token sent in
 * the Authorization header works everywhere. The trade-off: JavaScript can read
 * localStorage, so a cross-site-scripting bug could steal the token (React escapes
 * everything it renders, which keeps that risk low). See docs/DECISIONS.md D-087.
 *
 * Every access is wrapped in try/catch: storage can be blocked (privacy settings),
 * and then the user simply isn't signed in.
 */

const STORAGE_KEY = "zoom-clone.auth-token";

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage blocked: the sign-in works for this page only.
  }
}

export function clearAuthToken(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

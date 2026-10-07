/**
 * The "?next=" part of the login page: where to go after signing in.
 *
 * Called by: RequireAuth (builds it) and the login/signup forms (follow it).
 */

const HOME = "/";

/** The login page, remembering the page the user was trying to open. */
export function loginPath(currentPath: string): string {
  return currentPath === HOME ? "/login" : `/login?next=${encodeURIComponent(currentPath)}`;
}

/**
 * Where to go after signing in. Only paths inside this site are accepted.
 *
 * INTERVIEW: without this check, a link like /login?next=https://evil.example would
 * send people to another site right after they typed their password (an "open
 * redirect"). Browsers read "//evil.example" (and "/\evil.example") as another site
 * too, so those are refused as well.
 */
export function safeNextPath(next: string | null): string {
  const isInsideThisSite =
    next !== null && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
  if (!isInsideThisSite) {
    return HOME;
  }
  return next;
}

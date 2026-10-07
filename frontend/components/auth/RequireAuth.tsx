/**
 * Wraps every page that needs an account (the (main) route group: Home, Meetings,
 * Schedule, ...). Signed out → off to the login page, which brings you back here after.
 *
 * Joining by link, the pre-join screen, the meeting room and the summary don't use it:
 * guests need no account, as in Zoom.
 *
 * INTERVIEW: this is only for a smooth experience, not security. The API refuses every
 * signed-in route without a valid token (401), whatever the browser shows.
 */

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/Feedback";
import { useCurrentUser } from "@/hooks/queries";
import { loginPath } from "@/lib/authRedirect";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isError } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const isSignedOut = user === null;

  useEffect(() => {
    if (isSignedOut) {
      router.replace(loginPath(pathname));
    }
  }, [isSignedOut, pathname, router]);

  // If the server can't be reached, show the page anyway: its own lists explain the error.
  if (user || isError) {
    return children;
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-10" aria-busy="true">
      <Skeleton className="h-96" />
    </div>
  );
}

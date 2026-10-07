/**
 * Layout for every page with the top navbar (Home, Meetings, Schedule, placeholder tabs).
 * These pages need an account, so RequireAuth sends signed-out visitors to /login.
 *
 * The meeting room and the join screens live outside the (main) folder, so they don't
 * get this navbar, and guests can use them. That's what the route group is for.
 */

import { RequireAuth } from "@/components/auth/RequireAuth";
import { Navbar } from "@/components/layout/Navbar";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireAuth>
      <Navbar />
      <main>{children}</main>
    </RequireAuth>
  );
}

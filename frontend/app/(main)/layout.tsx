/**
 * Layout for every page with the top navbar (Home, Meetings, Schedule, placeholder tabs).
 *
 * The meeting room and the join screens live outside the (main) folder, so they don't
 * get this navbar. That's what the route group is for.
 */

import { Navbar } from "@/components/layout/Navbar";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
    </>
  );
}

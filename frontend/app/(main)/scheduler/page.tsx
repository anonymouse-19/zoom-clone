/** "Scheduler" tab: a placeholder; this product area is outside the project's scope. */

import { CalendarDays } from "lucide-react";

import { ComingSoon } from "@/components/layout/ComingSoon";

export default function SchedulerPage() {
  return (
    <ComingSoon
      title="Scheduler"
      icon={CalendarDays}
      description="Share booking pages so people can pick a time that works for you."
    />
  );
}

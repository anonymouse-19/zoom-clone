/**
 * Home dashboard ("/"): action tiles and the clock card on top; below them, tabs for
 * the next 7 days of meetings and recent meetings.
 *
 * Client component: it reads the clock and server data through hooks.
 */

"use client";

import { useState } from "react";

import { ActionTiles } from "@/components/home/ActionTiles";
import { ClockCard } from "@/components/home/ClockCard";
import { RecentMeetingList, UpcomingMeetingList } from "@/components/home/MeetingList";
import { Skeleton } from "@/components/ui/Feedback";
import { Tabs } from "@/components/ui/Tabs";
import { useCurrentUser, useMeetings } from "@/hooks/queries";
import { useNow } from "@/hooks/useNow";
import type { MeetingListItem } from "@/lib/api";

type HomeTab = "upcoming" | "recent";

const HOME_TABS: { id: HomeTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "recent", label: "Recent" },
];

const UPCOMING_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60_000;

/** Only meetings starting within the next week, like Zoom's home list. */
function withinNextWeek(meetings: MeetingListItem[], now: Date): MeetingListItem[] {
  const windowEnd = now.getTime() + UPCOMING_WINDOW_DAYS * MS_PER_DAY;
  return meetings.filter(
    (meeting) => meeting.start_time !== null && new Date(meeting.start_time).getTime() < windowEnd,
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<HomeTab>("upcoming");
  const now = useNow(ONE_MINUTE_MS);
  const { data: user } = useCurrentUser();
  const upcoming = useMeetings("upcoming");
  const recent = useMeetings("recent");

  function renderActiveTab() {
    if (!user || !now) {
      return <Skeleton className="mx-4 h-24" />;
    }
    if (activeTab === "recent") {
      return (
        <RecentMeetingList
          meetings={recent.data}
          isLoading={recent.isLoading}
          errorMessage={recent.error?.message ?? null}
          timeZone={user.timezone}
          currentUserId={user.id}
          now={now}
        />
      );
    }
    return (
      <UpcomingMeetingList
        meetings={upcoming.data ? withinNextWeek(upcoming.data, now) : undefined}
        isLoading={upcoming.isLoading}
        errorMessage={upcoming.error?.message ?? null}
        timeZone={user.timezone}
        currentUserId={user.id}
        now={now}
        emptyTitle="No meetings in the next 7 days"
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_440px] lg:gap-16">
        <div className="flex justify-center">
          <ActionTiles />
        </div>
        <ClockCard />
      </div>

      <section aria-label="Your meetings" className="mt-12">
        <Tabs
          tabs={HOME_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          ariaLabel="Meeting lists"
        />
        <div className="py-4">{renderActiveTab()}</div>
      </section>
    </div>
  );
}

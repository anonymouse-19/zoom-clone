/**
 * The card on the right of Home: a scenic header with the live time and date, then
 * today's remaining meetings (Start for meetings you host, Join for the rest).
 *
 * The "scenery" is a CSS gradient and an inline SVG skyline, so there's no image file to
 * load or license.
 */

"use client";

import { CalendarCheck } from "lucide-react";

import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { useCurrentUser, useMeetings } from "@/hooks/queries";
import { useNow } from "@/hooks/useNow";
import type { MeetingListItem, User } from "@/lib/api";
import { calendarDayKey, formatLongDate, formatTime } from "@/lib/format";

import { UpcomingMeetingRow } from "./MeetingRow";

// The clock shows minutes, but ticking every second keeps it exact at the minute change.
const CLOCK_TICK_MS = 1000;

export function ClockCard() {
  const now = useNow(CLOCK_TICK_MS);
  const { data: user } = useCurrentUser();
  const upcoming = useMeetings("upcoming");

  const isReady = now !== null && user !== undefined;
  // Keep only meetings whose start falls on today's date in the user's timezone.
  const todaysMeetings =
    isReady && upcoming.data
      ? upcoming.data.filter(
          (meeting) =>
            meeting.start_time !== null &&
            calendarDayKey(meeting.start_time, user.timezone) ===
              calendarDayKey(now, user.timezone),
        )
      : [];

  return (
    <section
      aria-label="Today"
      className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"
    >
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[#1b3a7a] via-[#4a5fb0] to-[#f0a273] px-6 py-5 text-white">
        <SkylineDecoration />
        {isReady ? (
          <div className="relative">
            <p className="text-5xl font-semibold tracking-tight">
              {formatTime(now, user.timezone)}
            </p>
            <p className="mt-1 text-sm font-medium text-white/90">
              {formatLongDate(now, user.timezone)}
            </p>
          </div>
        ) : (
          <div className="relative flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-12 w-40 bg-white/30" />
            <Skeleton className="h-4 w-48 bg-white/30" />
          </div>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto py-2">
        {isReady && !upcoming.isLoading ? (
          <TodaysMeetings meetings={todaysMeetings} user={user} />
        ) : (
          <div className="px-4 py-3">
            <Skeleton className="h-10 w-full" />
          </div>
        )}
      </div>
    </section>
  );
}

function TodaysMeetings({ meetings, user }: { meetings: MeetingListItem[]; user: User }) {
  if (meetings.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck size={28} aria-hidden />}
        title="No upcoming meetings today"
      />
    );
  }
  return (
    <ul className="divide-y divide-line">
      {meetings.map((meeting) => (
        <UpcomingMeetingRow
          key={meeting.meeting_code}
          meeting={meeting}
          timeZone={user.timezone}
          currentUserId={user.id}
          layout="stacked"
        />
      ))}
    </ul>
  );
}

/** Soft hills and a low sun along the bottom of the card header. */
function SkylineDecoration() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 100"
      preserveAspectRatio="none"
      className="absolute inset-x-0 bottom-0 h-20 w-full"
    >
      <circle cx="310" cy="62" r="22" fill="#ffd9a8" opacity="0.7" />
      <path d="M0 70 Q60 40 120 62 T240 58 T400 50 V100 H0 Z" fill="#203a6b" opacity="0.55" />
      <path d="M0 85 Q80 60 160 80 T320 76 T400 72 V100 H0 Z" fill="#15284d" opacity="0.8" />
    </svg>
  );
}

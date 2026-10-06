/**
 * Meeting lists with all their states: loading skeletons, an error line, an empty state,
 * or the rows themselves.
 * - UpcomingMeetingList groups rows under "Today", "Tomorrow", "Thu, Oct 8" headings.
 * - RecentMeetingList is a plain list, most recent first.
 *
 * Presentational: the parent fetches the data and passes it in.
 */

"use client";

import { CalendarX, History } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState, ErrorMessage, Skeleton } from "@/components/ui/Feedback";
import type { MeetingListItem } from "@/lib/api";
import { groupByDay } from "@/lib/format";

import { RecentMeetingRow, UpcomingMeetingRow } from "./MeetingRow";

const SKELETON_ROW_COUNT = 3;

type ListProps = {
  meetings: MeetingListItem[] | undefined;
  isLoading: boolean;
  errorMessage: string | null;
  timeZone: string;
  currentUserId: number;
  now: Date;
};

type UpcomingListProps = ListProps & {
  emptyTitle?: string;
  /** Extra "…" menu items per row (the Meetings page adds Edit / Delete). */
  renderExtraMenuItems?: (meeting: MeetingListItem) => ReactNode;
};

export function UpcomingMeetingList({
  meetings,
  isLoading,
  errorMessage,
  timeZone,
  currentUserId,
  now,
  emptyTitle = "No upcoming meetings",
  renderExtraMenuItems,
}: UpcomingListProps) {
  if (isLoading) {
    return <ListSkeleton />;
  }
  if (errorMessage) {
    return <ErrorMessage message={errorMessage} />;
  }
  if (!meetings || meetings.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX size={32} aria-hidden />}
        title={emptyTitle}
        message="Scheduled meetings will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groupByDay(meetings, timeZone, now).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="px-4 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
            {group.label}
          </h3>
          <ul className="divide-y divide-line">
            {group.items.map((meeting) => (
              <UpcomingMeetingRow
                key={meeting.meeting_code}
                meeting={meeting}
                timeZone={timeZone}
                currentUserId={currentUserId}
                extraMenuItems={renderExtraMenuItems?.(meeting)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function RecentMeetingList({
  meetings,
  isLoading,
  errorMessage,
  timeZone,
  currentUserId,
}: ListProps) {
  if (isLoading) {
    return <ListSkeleton />;
  }
  if (errorMessage) {
    return <ErrorMessage message={errorMessage} />;
  }
  if (!meetings || meetings.length === 0) {
    return (
      <EmptyState
        icon={<History size={32} aria-hidden />}
        title="No recent meetings"
        message="Meetings you've attended will show up here."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {meetings.map((meeting) => (
        <RecentMeetingRow
          key={meeting.meeting_code}
          meeting={meeting}
          timeZone={timeZone}
          currentUserId={currentUserId}
        />
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-2" aria-busy="true" aria-label="Loading meetings">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-4 w-28" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

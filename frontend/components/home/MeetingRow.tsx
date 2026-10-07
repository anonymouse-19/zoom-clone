/**
 * One meeting in a list.
 * - UpcomingMeetingRow: time range, title, meeting ID, and Start (host) / Join, plus a
 *   "…" menu (Copy invitation, Details, and any extra items the page adds). In the 10
 *   minutes before it starts, a countdown appears and Start is highlighted.
 * - RecentMeetingRow: when it ran, how long, how many people, and Start again / Details.
 *
 * Used by: home/MeetingList.tsx, home/ClockCard.tsx, and the Meetings page.
 */

"use client";

import { Ellipsis } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { useCreateInstantMeeting } from "@/hooks/queries";
import { useMeetingActions } from "@/hooks/useMeetingActions";
import { useNow } from "@/hooks/useNow";
import type { MeetingListItem } from "@/lib/api";
import {
  formatDuration,
  formatFullDate,
  formatTime,
  formatTimeRange,
  minutesUntil,
} from "@/lib/format";

const MS_PER_MINUTE = 60_000;
// "Starting soon" nudge: how early it appears, and how often the countdown updates.
const STARTING_SOON_MINUTES = 10;
const COUNTDOWN_REFRESH_MS = 30_000;

/**
 * - "responsive": on wide screens the time gets its own column on the left; on phones it
 *   moves above the title, so the title isn't squeezed.
 * - "stacked": the time is always above the title (for narrow places like the clock card).
 */
export type RowLayout = "responsive" | "stacked";

type UpcomingMeetingRowProps = {
  meeting: MeetingListItem;
  timeZone: string;
  currentUserId: number;
  layout?: RowLayout;
  /** Extra "…" menu entries, e.g. Edit and Delete on the Meetings page. */
  extraMenuItems?: ReactNode;
};

export function UpcomingMeetingRow({
  meeting,
  timeZone,
  currentUserId,
  layout = "responsive",
  extraMenuItems,
}: UpcomingMeetingRowProps) {
  const router = useRouter();
  const { startAndEnter, goToJoin, copyInvitation, isStarting } = useMeetingActions();
  const isHost = meeting.host.id === currentUserId;
  const isLive = meeting.status === "live";
  const timeRange = meeting.start_time
    ? formatTimeRange(meeting.start_time, meeting.duration_minutes, timeZone)
    : "";
  const countdown = useStartingSoonCountdown(meeting);

  return (
    <li className="flex items-center gap-4 px-4 py-3 hover:bg-canvas">
      {layout === "responsive" && (
        <div className="hidden w-36 shrink-0 text-sm sm:block">
          <p className="font-semibold">{timeRange}</p>
          {isLive && <p className="mt-0.5 text-xs font-semibold text-zoom-green">In progress</p>}
          {countdown && (
            <p className="mt-0.5 text-xs font-semibold text-zoom-orange">{countdown}</p>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p
          className={`text-xs font-semibold text-ink-muted ${layout === "responsive" ? "sm:hidden" : ""}`}
        >
          {timeRange}
          {isLive && <span className="text-zoom-green"> · In progress</span>}
          {countdown && <span className="text-zoom-orange"> · {countdown}</span>}
        </p>
        <p className="truncate text-sm font-semibold">{meeting.title}</p>
        <p className="truncate text-xs text-ink-muted">
          Meeting ID: {meeting.formatted_code}
          {!isHost && ` · Host: ${meeting.host.name}`}
        </p>
      </div>

      {isHost ? (
        <Button
          size="sm"
          onClick={() => startAndEnter(meeting.meeting_code)}
          disabled={isStarting}
          className={countdown ? "ring-2 ring-zoom-orange ring-offset-2" : ""}
        >
          Start
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => goToJoin(meeting.meeting_code)}>
          Join
        </Button>
      )}

      <Dropdown
        triggerAriaLabel={`More actions for ${meeting.title}`}
        triggerClassName="rounded-md p-1.5 text-ink-muted hover:bg-white hover:text-ink"
        trigger={<Ellipsis size={18} aria-hidden />}
      >
        <DropdownItem onSelect={() => copyInvitation(meeting.meeting_code)}>
          Copy invitation
        </DropdownItem>
        <DropdownItem onSelect={() => router.push(`/meetings/${meeting.meeting_code}`)}>
          View details
        </DropdownItem>
        {extraMenuItems}
      </Dropdown>
    </li>
  );
}

/**
 * "Starts in 7 min" during the last 10 minutes before a scheduled start ("Starting now" at
 * zero), so the host notices it's time. Null otherwise, and for meetings already live.
 */
function useStartingSoonCountdown(meeting: MeetingListItem): string | null {
  const now = useNow(COUNTDOWN_REFRESH_MS);
  if (now === null || meeting.start_time === null || meeting.status === "live") {
    return null;
  }
  const minutesToStart = minutesUntil(meeting.start_time, now);
  if (minutesToStart < 0 || minutesToStart > STARTING_SOON_MINUTES) {
    return null;
  }
  if (minutesToStart === 0) {
    return "Starting now";
  }
  return `Starts in ${minutesToStart} min`;
}

type RecentMeetingRowProps = {
  meeting: MeetingListItem;
  timeZone: string;
  currentUserId: number;
};

export function RecentMeetingRow({ meeting, timeZone, currentUserId }: RecentMeetingRowProps) {
  const router = useRouter();
  const createInstantMeeting = useCreateInstantMeeting();
  const { startAndEnter, isStarting } = useMeetingActions();
  const isHost = meeting.host.id === currentUserId;

  /** "Start again": a new instant meeting with the same title (old meetings can't restart). */
  async function startAgain() {
    try {
      const newMeeting = await createInstantMeeting.mutateAsync({
        usePersonalMeetingId: false,
        title: meeting.title,
      });
      await startAndEnter(newMeeting.meeting_code);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the meeting");
    }
  }

  return (
    <li className="flex items-center gap-4 px-4 py-3 hover:bg-canvas">
      {/* Wide screens: date column on the left. Phones: date line above the title. */}
      <div className="hidden w-36 shrink-0 text-sm sm:block">
        {meeting.started_at && (
          <>
            <p className="font-semibold">{formatFullDate(meeting.started_at, timeZone)}</p>
            <p className="text-xs text-ink-muted">{formatTime(meeting.started_at, timeZone)}</p>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {meeting.started_at && (
          <p className="text-xs font-semibold text-ink-muted sm:hidden">
            {formatFullDate(meeting.started_at, timeZone)},{" "}
            {formatTime(meeting.started_at, timeZone)}
          </p>
        )}
        <p className="truncate text-sm font-semibold">{meeting.title}</p>
        <p className="truncate text-xs text-ink-muted">
          {formatDuration(actualMinutes(meeting))} · {meeting.attendee_count}{" "}
          {meeting.attendee_count === 1 ? "participant" : "participants"}
          {!isHost && ` · Host: ${meeting.host.name}`}
        </p>
      </div>

      {isHost && (
        <Button
          size="sm"
          variant="secondary"
          onClick={startAgain}
          disabled={createInstantMeeting.isPending || isStarting}
        >
          Start again
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => router.push(`/meetings/${meeting.meeting_code}`)}
      >
        Details
      </Button>
    </li>
  );
}

/** How long the meeting actually ran (not how long it was planned for). */
function actualMinutes(meeting: MeetingListItem): number {
  if (!meeting.started_at || !meeting.ended_at) {
    return meeting.duration_minutes;
  }
  const elapsedMs = new Date(meeting.ended_at).getTime() - new Date(meeting.started_at).getTime();
  return Math.round(elapsedMs / MS_PER_MINUTE);
}

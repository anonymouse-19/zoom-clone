/**
 * Everything about one meeting (the /meetings/[code] page): time, ID, passcode, invite
 * link, options and invitees, with the actions that fit its state.
 * - Upcoming or live: Start (host) / Join, Copy invitation, Add to calendar
 * - Upcoming, host only: Edit, Delete (with confirmation)
 * - Ended: View summary
 */

"use client";

import { ArrowLeft, CalendarPlus, Copy, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { useCancelMeeting } from "@/hooks/queries";
import { useMeetingActions } from "@/hooks/useMeetingActions";
import { calendarFileUrl, type MeetingDetail, type MeetingStatus, type User } from "@/lib/api";
import { formatDuration, formatFullDate, formatTimeRange } from "@/lib/format";
import { googleCalendarUrl } from "@/lib/ics";

const STATUS_BADGES: Record<MeetingStatus, { label: string; className: string }> = {
  scheduled: { label: "Upcoming", className: "bg-zoom-blue-soft text-zoom-blue" },
  live: { label: "In progress", className: "bg-green-50 text-green-700" },
  ended: { label: "Ended", className: "bg-canvas text-ink-muted" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-zoom-red" },
};

type MeetingDetailsViewProps = { meeting: MeetingDetail; user: User };

export function MeetingDetailsView({ meeting, user }: MeetingDetailsViewProps) {
  const router = useRouter();
  const { startAndEnter, goToJoin, copyInvitation, isStarting } = useMeetingActions();
  const cancelMeeting = useCancelMeeting();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const isHost = meeting.host.id === user.id;
  const canEnter = meeting.status === "scheduled" || meeting.status === "live";
  const canEdit = isHost && meeting.status === "scheduled" && meeting.type === "scheduled";
  const badge = STATUS_BADGES[meeting.status];

  async function deleteMeeting() {
    try {
      await cancelMeeting.mutateAsync(meeting.meeting_code);
      toast.success("Meeting deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the meeting");
    } finally {
      setIsConfirmingDelete(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zoom-blue hover:underline"
      >
        <ArrowLeft size={16} aria-hidden /> Meetings
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{meeting.title}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {canEnter && isHost && (
          <Button onClick={() => startAndEnter(meeting.meeting_code)} disabled={isStarting}>
            Start
          </Button>
        )}
        {canEnter && !isHost && (
          <Button onClick={() => goToJoin(meeting.meeting_code)}>Join</Button>
        )}
        {canEnter && (
          <Button variant="secondary" onClick={() => copyInvitation(meeting.meeting_code)}>
            <Copy size={16} aria-hidden /> Copy invitation
          </Button>
        )}
        {canEnter && meeting.start_time && <AddToCalendarMenu meeting={meeting} />}
        {canEdit && (
          <Button
            variant="secondary"
            onClick={() => router.push(`/schedule?edit=${meeting.meeting_code}`)}
          >
            Edit
          </Button>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            className="text-zoom-red"
            onClick={() => setIsConfirmingDelete(true)}
          >
            Delete
          </Button>
        )}
        {meeting.status === "ended" && (
          <Button
            variant="secondary"
            onClick={() => router.push(`/room/${meeting.meeting_code}/ended`)}
          >
            View summary
          </Button>
        )}
      </div>

      <MeetingFacts meeting={meeting} timeZone={user.timezone} />

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Delete meeting?"
        message="Invitees will see that this meeting was cancelled if they open the link."
        confirmLabel="Delete"
        isWorking={cancelMeeting.isPending}
        onConfirm={deleteMeeting}
        onCancel={() => setIsConfirmingDelete(false)}
      />
    </div>
  );
}

/** The "Add to calendar ⌄" button: .ics download or Google Calendar. */
function AddToCalendarMenu({ meeting }: { meeting: MeetingDetail }) {
  const googleUrl = googleCalendarUrl(meeting);
  return (
    <Dropdown
      align="left"
      triggerAriaLabel="Add to calendar"
      triggerClassName="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-5 text-sm font-semibold hover:bg-canvas"
      trigger={
        <>
          <CalendarPlus size={16} aria-hidden /> Add to calendar
        </>
      }
    >
      <DropdownItem onSelect={() => window.open(calendarFileUrl(meeting.meeting_code), "_self")}>
        Outlook / Apple Calendar (.ics)
      </DropdownItem>
      {googleUrl && (
        <DropdownItem onSelect={() => window.open(googleUrl, "_blank", "noopener")}>
          Google Calendar
        </DropdownItem>
      )}
    </Dropdown>
  );
}

/** The definition list of facts about the meeting. */
function MeetingFacts({ meeting, timeZone }: { meeting: MeetingDetail; timeZone: string }) {
  const [isPasscodeVisible, setIsPasscodeVisible] = useState(false);
  const { settings } = meeting;

  async function copyInviteLink() {
    await navigator.clipboard.writeText(meeting.invite_link);
    toast.success("Invite link copied");
  }

  return (
    <dl className="mt-8 divide-y divide-line border-y border-line text-sm">
      {meeting.start_time && (
        <Fact label="Time">
          {formatFullDate(meeting.start_time, timeZone)},{" "}
          {formatTimeRange(meeting.start_time, meeting.duration_minutes, timeZone)}
          <span className="text-ink-muted">
            {" "}
            · {formatDuration(meeting.duration_minutes)} · {timeZone}
          </span>
        </Fact>
      )}
      {meeting.description && (
        <Fact label="Description">
          <span className="whitespace-pre-line">{meeting.description}</span>
        </Fact>
      )}
      <Fact label="Meeting ID">{meeting.formatted_code}</Fact>
      <Fact label="Host">{meeting.host.name}</Fact>
      <Fact label="Passcode">
        <span className="inline-flex items-center gap-2">
          <span className="font-mono">{isPasscodeVisible ? meeting.passcode : "••••••"}</span>
          <button
            type="button"
            onClick={() => setIsPasscodeVisible((isVisible) => !isVisible)}
            aria-label={isPasscodeVisible ? "Hide passcode" : "Show passcode"}
            className="rounded p-1 text-ink-muted hover:bg-canvas hover:text-ink"
          >
            {isPasscodeVisible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </span>
      </Fact>
      <Fact label="Invite link">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-zoom-blue">{meeting.invite_link}</span>
          <button
            type="button"
            onClick={copyInviteLink}
            aria-label="Copy invite link"
            className="shrink-0 rounded p-1 text-ink-muted hover:bg-canvas hover:text-ink"
          >
            <Copy size={16} aria-hidden />
          </button>
        </span>
      </Fact>
      <Fact label="Video">
        Host {onOff(settings.video_on_entry_host)} · Participants{" "}
        {onOff(settings.video_on_entry_participant)}
      </Fact>
      <Fact label="Options">
        <ul className="flex flex-col gap-1">
          <li>Waiting room: {onOff(settings.waiting_room_enabled)}</li>
          <li>Mute participants on entry: {onOff(settings.mute_on_entry)}</li>
          <li>Allow participants to join before host: {onOff(settings.allow_join_before_host)}</li>
          <li>
            Screen sharing: {settings.allow_screen_share === "all" ? "Everyone" : "Host only"}
          </li>
        </ul>
      </Fact>
      {meeting.invitees.length > 0 && (
        <Fact label="Invitees">
          <ul className="flex flex-wrap gap-2">
            {meeting.invitees.map((invitee) => (
              <li key={invitee.email} className="rounded-full bg-canvas px-3 py-1 text-xs">
                {invitee.name ?? invitee.email}
              </li>
            ))}
          </ul>
        </Fact>
      )}
    </dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function onOff(isOn: boolean): string {
  return isOn ? "On" : "Off";
}

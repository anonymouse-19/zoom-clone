/**
 * Meetings page → "Personal Room" tab: the user's permanent meeting room. Shows the
 * Personal Meeting ID, the invite link and the passcode, with Start and Copy invitation.
 */

"use client";

import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { ErrorMessage, Skeleton } from "@/components/ui/Feedback";
import { useMeeting } from "@/hooks/queries";
import { useMeetingActions } from "@/hooks/useMeetingActions";
import type { User } from "@/lib/api";

export function PersonalRoomPanel({ user }: { user: User }) {
  // A personal room is a meeting whose code *is* the user's PMI (see docs/SCHEMA.md).
  const room = useMeeting(user.personal_meeting_id);
  const { startAndEnter, copyInvitation, isStarting } = useMeetingActions();
  const [isPasscodeVisible, setIsPasscodeVisible] = useState(false);

  if (room.isLoading) {
    return <Skeleton className="m-4 h-40" />;
  }
  if (room.error || !room.data) {
    return <ErrorMessage message={room.error?.message ?? "Couldn't load your personal room"} />;
  }

  const meeting = room.data;

  async function copyInviteLink() {
    await navigator.clipboard.writeText(meeting.invite_link);
    toast.success("Invite link copied");
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 px-4 py-6">
      <div>
        <h2 className="text-lg font-semibold">My Personal Room</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Your permanent meeting room. The link never changes, so it&apos;s good for regular
          meetings and quick calls.
        </p>
      </div>

      <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-4 text-sm">
        <dt className="text-ink-muted">Personal Meeting ID</dt>
        <dd className="font-semibold">{meeting.formatted_code}</dd>

        <dt className="text-ink-muted">Invite link</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <span className="truncate text-zoom-blue">{meeting.invite_link}</span>
          <button
            type="button"
            onClick={copyInviteLink}
            aria-label="Copy invite link"
            className="shrink-0 rounded p-1 text-ink-muted hover:bg-canvas hover:text-ink"
          >
            <Copy size={16} aria-hidden />
          </button>
        </dd>

        <dt className="text-ink-muted">Passcode</dt>
        <dd className="flex items-center gap-2">
          <span className="font-mono">{isPasscodeVisible ? meeting.passcode : "••••••"}</span>
          <button
            type="button"
            onClick={() => setIsPasscodeVisible((isVisible) => !isVisible)}
            aria-label={isPasscodeVisible ? "Hide passcode" : "Show passcode"}
            className="rounded p-1 text-ink-muted hover:bg-canvas hover:text-ink"
          >
            {isPasscodeVisible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </dd>
      </dl>

      <div className="flex gap-3">
        <Button onClick={() => startAndEnter(meeting.meeting_code)} disabled={isStarting}>
          Start
        </Button>
        <Button variant="secondary" onClick={() => copyInvitation(meeting.meeting_code)}>
          Copy invitation
        </Button>
      </div>
    </div>
  );
}

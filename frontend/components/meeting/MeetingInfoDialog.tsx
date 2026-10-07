/**
 * "Meeting information", opened from the green shield in the meeting header: topic,
 * meeting ID, host, passcode, and the invite link with a Copy button, like Zoom's popover.
 */

"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { MeetingDetail } from "@/lib/api";

type MeetingInfoDialogProps = {
  meeting: MeetingDetail | undefined;
  isOpen: boolean;
  onClose: () => void;
};

export function MeetingInfoDialog({ meeting, isOpen, onClose }: MeetingInfoDialogProps) {
  async function copyInviteLink() {
    if (meeting !== undefined) {
      await navigator.clipboard.writeText(meeting.invite_link);
      toast.success("Invite link copied");
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Meeting information">
      {meeting === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-ink-muted">Topic</dt>
          <dd className="font-medium">{meeting.title}</dd>
          <dt className="text-ink-muted">Meeting ID</dt>
          <dd>{meeting.formatted_code}</dd>
          <dt className="text-ink-muted">Host</dt>
          <dd>{meeting.host.name}</dd>
          <dt className="text-ink-muted">Passcode</dt>
          <dd className="font-mono">{meeting.passcode}</dd>
          <dt className="text-ink-muted">Invite link</dt>
          <dd className="flex min-w-0 flex-col items-start gap-2">
            <span className="w-full truncate text-zoom-blue">{meeting.invite_link}</span>
            <Button size="sm" variant="secondary" onClick={copyInviteLink}>
              Copy link
            </Button>
          </dd>
        </dl>
      )}
    </Modal>
  );
}

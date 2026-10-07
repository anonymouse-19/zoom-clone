/**
 * Shown right after scheduling: the invitation text, ready to copy, and "Add to calendar"
 * (.ics file or Google Calendar), like Zoom's confirmation screen.
 */

"use client";

import { CalendarPlus, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { MeetingDetail } from "@/lib/api";
import { downloadCalendarFile, googleCalendarUrl } from "@/lib/ics";

type MeetingScheduledDialogProps = {
  meeting: MeetingDetail | null;
  onDone: () => void;
};

const LINK_BUTTON_CLASSES =
  "inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold hover:bg-canvas focus-visible:outline-2 focus-visible:outline-zoom-blue";

export function MeetingScheduledDialog({ meeting, onDone }: MeetingScheduledDialogProps) {
  async function copyInvitation() {
    if (meeting === null) {
      return;
    }
    await navigator.clipboard.writeText(meeting.invitation);
    toast.success("Invitation copied to clipboard");
  }

  const googleUrl = meeting ? googleCalendarUrl(meeting) : null;

  return (
    <Modal
      isOpen={meeting !== null}
      onClose={onDone}
      title="Meeting scheduled"
      widthClass="max-w-xl"
      footer={<Button onClick={onDone}>Done</Button>}
    >
      {meeting && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            <strong>{meeting.title}</strong> is scheduled. Share the invitation with your attendees:
          </p>
          <textarea
            readOnly
            value={meeting.invitation}
            rows={10}
            aria-label="Invitation text"
            className="w-full resize-none rounded-lg border border-line bg-canvas p-3 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={copyInvitation}>
              <Copy size={16} aria-hidden /> Copy invitation
            </Button>
            <button
              type="button"
              onClick={() => void downloadCalendarFile(meeting.meeting_code)}
              className={LINK_BUTTON_CLASSES}
            >
              <CalendarPlus size={16} aria-hidden /> Add to calendar (.ics)
            </button>
            {googleUrl && (
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK_BUTTON_CLASSES}
              >
                Google Calendar
              </a>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

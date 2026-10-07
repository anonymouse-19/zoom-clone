/**
 * The top bar of the meeting room: the green shield (meeting information), title and
 * ID, the running time since the meeting started, a lock badge, the View menu
 * (Speaker / Gallery) and the fullscreen toggle. On phones, also Zoom's switch-camera
 * button (front ↔ back); larger screens pick cameras from the toolbar's ^ menu instead.
 */

"use client";

import {
  Check,
  LayoutGrid,
  Lock,
  Maximize,
  Minimize,
  ShieldCheck,
  SwitchCamera,
} from "lucide-react";
import { useState } from "react";

import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useNow } from "@/hooks/useNow";
import type { MeetingDetail } from "@/lib/api";
import { formatElapsed } from "@/lib/format";
import { formatMeetingCode } from "@/lib/meetingCode";
import { useRoomStore, type RoomLayout } from "@/stores/roomStore";

import { MeetingInfoDialog } from "./MeetingInfoDialog";

const ONE_SECOND_MS = 1000;

const LAYOUT_OPTIONS: { layout: RoomLayout; label: string }[] = [
  { layout: "speaker", label: "Speaker" },
  { layout: "gallery", label: "Gallery" },
];

type RoomHeaderProps = {
  meetingCode: string;
  /** Undefined until the details have loaded. */
  meeting: MeetingDetail | undefined;
  /** I'm recording this meeting to my computer (More → Record). */
  isRecording: boolean;
  /** My camera is on and this device has more than one (a phone's front and back). */
  canSwitchCamera: boolean;
};

export function RoomHeader({
  meetingCode,
  meeting,
  isRecording,
  canSwitchCamera,
}: RoomHeaderProps) {
  const now = useNow(ONE_SECOND_MS);
  const layout = useRoomStore((state) => state.layout);
  const setLayout = useRoomStore((state) => state.setLayout);
  const isLocked = useRoomStore((state) => state.isLocked);
  const switchCamera = useRoomStore((state) => state.switchCamera);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  let elapsed = "";
  if (now !== null && meeting?.started_at) {
    elapsed = formatElapsed(now.getTime() - new Date(meeting.started_at).getTime());
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-3 text-sm md:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setIsInfoOpen(true)}
          aria-label="Meeting information"
          title="Meeting information"
          className="rounded-md p-1 text-zoom-green hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-zoom-blue"
        >
          <ShieldCheck size={18} aria-hidden />
        </button>
        <span className="truncate font-semibold">{meeting?.title ?? "Meeting"}</span>
        <span className="hidden shrink-0 text-white/60 sm:inline">
          ID {formatMeetingCode(meetingCode)}
        </span>
        {isLocked && <Lock size={14} className="shrink-0 text-white/70" aria-label="Locked" />}
        {isRecording && (
          <span className="flex shrink-0 items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-xs">
            <span className="h-2 w-2 animate-pulse rounded-full bg-zoom-red" aria-hidden />
            Recording
          </span>
        )}
      </div>
      <span className="text-white/80 tabular-nums" aria-label="Time in meeting">
        {elapsed}
      </span>
      <div className="flex items-center gap-1">
        {canSwitchCamera && (
          <button
            type="button"
            onClick={switchCamera}
            aria-label="Switch camera"
            title="Switch camera"
            className="rounded-md p-1.5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-zoom-blue sm:hidden"
          >
            <SwitchCamera size={18} aria-hidden />
          </button>
        )}
        <Dropdown
          trigger={
            <span className="flex items-center gap-1.5">
              <LayoutGrid size={16} aria-hidden /> View
            </span>
          }
          triggerAriaLabel="Change view"
          triggerClassName="rounded-md px-2 py-1 hover:bg-white/10"
        >
          {LAYOUT_OPTIONS.map((option) => (
            <DropdownItem key={option.layout} onSelect={() => setLayout(option.layout)}>
              <Check
                size={16}
                className={option.layout === layout ? "" : "invisible"}
                aria-hidden
              />
              {option.label}
            </DropdownItem>
          ))}
        </Dropdown>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="rounded-md p-1.5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-zoom-blue"
        >
          {isFullscreen ? <Minimize size={16} aria-hidden /> : <Maximize size={16} aria-hidden />}
        </button>
      </div>
      <MeetingInfoDialog
        meeting={meeting}
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
      />
    </header>
  );
}

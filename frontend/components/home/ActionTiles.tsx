/**
 * The 2×2 grid of Home actions: New meeting (orange), Join, Schedule, Share screen.
 * On phones it becomes one row of four, like Zoom's mobile layout.
 *
 * New meeting: Step 1, create an instant meeting on the server (optionally the personal
 * room, per the saved preference). Step 2, enter it through the host door.
 */

"use client";

import { formatInTimeZone } from "date-fns-tz";
import { Calendar, ChevronDown, Plus, ScreenShare, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { useCreateInstantMeeting, useCurrentUser } from "@/hooks/queries";
import { useMeetingActions } from "@/hooks/useMeetingActions";
import { useNow } from "@/hooks/useNow";
import { usePreferences } from "@/hooks/usePreferences";
import { formatMeetingCode } from "@/lib/meetingCode";

import { ActionTile } from "./ActionTile";

const TILE_ICON_SIZE = 34;
const ONE_MINUTE_MS = 60_000;

export function ActionTiles() {
  const router = useRouter();
  const createInstantMeeting = useCreateInstantMeeting();
  const { startAndEnter, isStarting } = useMeetingActions();
  const { preferences } = usePreferences();

  async function startNewMeeting() {
    try {
      const meeting = await createInstantMeeting.mutateAsync({
        usePersonalMeetingId: preferences.usePersonalMeetingId,
      });
      await startAndEnter(meeting.meeting_code);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start a meeting");
    }
  }

  return (
    <div className="grid grid-cols-4 justify-items-center gap-x-4 gap-y-8 sm:grid-cols-2 sm:gap-x-10">
      <ActionTile
        label="New meeting"
        color="orange"
        icon={<Video size={TILE_ICON_SIZE} fill="currentColor" aria-hidden />}
        onClick={startNewMeeting}
        disabled={createInstantMeeting.isPending || isStarting}
        labelAccessory={<NewMeetingOptions />}
      />
      <ActionTile
        label="Join"
        color="blue"
        icon={<Plus size={TILE_ICON_SIZE} strokeWidth={2.5} aria-hidden />}
        onClick={() => router.push("/join")}
      />
      <ActionTile
        label="Schedule"
        color="blue"
        icon={<CalendarWithToday />}
        onClick={() => router.push("/schedule")}
      />
      <ActionTile
        label="Share screen"
        color="blue"
        icon={<ScreenShare size={TILE_ICON_SIZE} aria-hidden />}
        // Zoom's "Share screen" first asks which meeting to share into, so it opens Join.
        onClick={() => router.push("/join?share=1")}
      />
    </div>
  );
}

/** The "⌄" menu next to "New meeting": start with video, and use my PMI. */
function NewMeetingOptions() {
  const { preferences, updatePreference } = usePreferences();
  const { data: user } = useCurrentUser();

  return (
    <Dropdown
      triggerAriaLabel="New meeting options"
      triggerClassName="rounded p-0.5 text-ink-muted hover:bg-canvas hover:text-ink"
      trigger={<ChevronDown size={14} aria-hidden />}
      align="left"
    >
      <div className="flex flex-col gap-4 px-4 py-2">
        <Toggle
          label="Start with video"
          isOn={preferences.startWithVideo}
          onChange={(isOn) => updatePreference("startWithVideo", isOn)}
        />
        <Toggle
          label="Use my Personal Meeting ID (PMI)"
          description={user ? formatMeetingCode(user.personal_meeting_id) : undefined}
          isOn={preferences.usePersonalMeetingId}
          onChange={(isOn) => updatePreference("usePersonalMeetingId", isOn)}
        />
      </div>
    </Dropdown>
  );
}

/** Zoom's Schedule tile: a calendar icon with today's date number inside it. */
function CalendarWithToday() {
  const now = useNow(ONE_MINUTE_MS);
  const { data: user } = useCurrentUser();
  // Until the clock and the user's timezone are known, show the plain calendar.
  const dayOfMonth = now && user ? formatInTimeZone(now, user.timezone, "d") : "";

  return (
    <span className="relative grid place-items-center">
      <Calendar size={TILE_ICON_SIZE} aria-hidden />
      <span className="absolute top-[13px] text-[12px] font-bold" aria-hidden>
        {dayOfMonth}
      </span>
    </span>
  );
}

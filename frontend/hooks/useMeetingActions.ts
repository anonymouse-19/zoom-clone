/**
 * The everyday actions on a meeting: Start (the host door), Join (the guest door), and
 * Copy invitation. Shared by the dashboard, the Meetings page, the details page and the
 * Join page, so each button behaves the same everywhere.
 *
 * Side effects: network calls, page navigation, clipboard writes, sessionStorage
 * (the join ticket), and toasts.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { saveMeetingSession } from "@/lib/meetingSession";

import { queryKeys, useCurrentUser } from "./queries";
import { usePreferences } from "./usePreferences";

/** Turn any thrown value into a message worth showing. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function useMeetingActions() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { preferences } = usePreferences();
  const [isStarting, setIsStarting] = useState(false);

  /**
   * The host door (dashboard Start / New meeting):
   * Step 1: join as host. The server checks we host it, and starts it if needed.
   * Step 2: save the join ticket for this tab (mic/camera from the saved preferences).
   * Step 3: go into the room.
   */
  async function startAndEnter(meetingCode: string) {
    if (!user) {
      return;
    }
    setIsStarting(true);
    try {
      const joined = await api.joinMeeting(meetingCode, {
        display_name: user.name,
        join_as: "host",
      });
      saveMeetingSession({
        meetingCode,
        participantId: joined.participant_id,
        sessionToken: joined.session_token,
        displayName: joined.display_name,
        role: joined.role,
        status: joined.status,
        isMicOn: !preferences.joinMuted,
        isCameraOn: preferences.startWithVideo,
        cameraId: "",
        microphoneId: "",
        speakerId: "",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.allMeetingLists });
      router.push(`/room/${meetingCode}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setIsStarting(false);
    }
  }

  /**
   * The guest door: open the pre-join screen with this meeting's invite token, so an
   * invited user isn't asked for the passcode.
   */
  async function goToJoin(meetingCode: string) {
    try {
      const meeting = await queryClient.fetchQuery({
        queryKey: queryKeys.meeting(meetingCode),
        queryFn: () => api.getMeeting(meetingCode),
      });
      const inviteUrl = new URL(meeting.invite_link);
      router.push(`${inviteUrl.pathname}${inviteUrl.search}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  /** Fetch the meeting's invitation text (cached if already loaded) and copy it. */
  async function copyInvitation(meetingCode: string) {
    try {
      const meeting = await queryClient.fetchQuery({
        queryKey: queryKeys.meeting(meetingCode),
        queryFn: () => api.getMeeting(meetingCode),
      });
      await navigator.clipboard.writeText(meeting.invitation);
      toast.success("Invitation copied to clipboard");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return { startAndEnter, goToJoin, copyInvitation, isStarting };
}

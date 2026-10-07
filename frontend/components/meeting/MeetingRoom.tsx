/**
 * The meeting room screen (/room/{code}).
 *
 *   Step 1: read this tab's join ticket (saved by the pre-join screen or the host's Start).
 *           No ticket → "join first".
 *   Step 2: open the camera/microphone as chosen before joining.
 *   Step 3: connect to the room (hooks/useRoomConnection.ts): WebSocket + WebRTC links.
 *   Step 4: show the room (header, video stage, side panel, toolbar), or a full-screen
 *           message: connecting, the waiting room, removed, connection lost.
 *           When the meeting ends, or I leave, go to the meeting's summary page.
 *
 * Only ever rendered in the browser (see app/room/[code]/page.tsx), so it can read
 * sessionStorage and window.location directly.
 */

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { queryKeys, useMeeting } from "@/hooks/queries";
import { useLocalMedia } from "@/hooks/useLocalMedia";
import { useLocalRecording } from "@/hooks/useLocalRecording";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useMeetingShortcuts } from "@/hooks/useMeetingShortcuts";
import { usePreferences } from "@/hooks/usePreferences";
import { useRoomConnection } from "@/hooks/useRoomConnection";
import { canBrowserShareScreen, useScreenShare } from "@/hooks/useScreenShare";
import { MEDIA_ERROR_MESSAGES, type MediaErrorKind } from "@/lib/media";
import { clearMeetingSession, loadMeetingSession, type MeetingSession } from "@/lib/meetingSession";
import type { LocalTracks } from "@/lib/roomConnection";
import { useRoomStore, type RoomStatus } from "@/stores/roomStore";

import { ChatPanel } from "./ChatPanel";
import { GalleryView } from "./GalleryView";
import { HostLeaveDialog } from "./HostLeaveDialog";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { RemoteAudio } from "./RemoteAudio";
import { RoomHeader } from "./RoomHeader";
import { RoomMessage, RoomMessageButton, RoomMessageLink } from "./RoomMessage";
import { RoomToolbar } from "./RoomToolbar";
import { ScreenShareView } from "./ScreenShareView";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { SpeakerView } from "./SpeakerView";

export function MeetingRoom({ meetingCode }: { meetingCode: string }) {
  // Step 1. Read once; the ticket doesn't change while the room is open.
  const [session] = useState(() => loadMeetingSession(meetingCode));
  if (session === null) {
    return (
      <RoomMessage
        title="You haven't joined this meeting yet"
        message="Join first to choose your name, camera and microphone."
        actions={
          <>
            <RoomMessageLink href={`/j/${meetingCode}`} isPrimary>
              Join meeting
            </RoomMessageLink>
            <RoomMessageLink href="/">Back to Home</RoomMessageLink>
          </>
        }
      />
    );
  }
  return <LiveRoom session={session} />;
}

/** Statuses in which my camera and microphone should be running. */
const STATUSES_WITH_MEDIA: RoomStatus[] = ["connecting", "connected", "reconnecting"];

function LiveRoom({ session }: { session: MeetingSession }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const { data: meeting } = useMeeting(session.meetingCode, true, session.sessionToken);
  const status = useRoomStore((state) => state.status);
  const statusMessage = useRoomStore((state) => state.statusMessage);
  const participants = useRoomStore((state) => state.participants);
  const settings = useRoomStore((state) => state.settings);
  const openPanel = useRoomStore((state) => state.openPanel);
  const isMicOn = useRoomStore((state) => state.isMicOn);
  const isCameraOn = useRoomStore((state) => state.isCameraOn);
  const screenTrack = useRoomStore((state) => state.screenTrack);
  const cameraId = useRoomStore((state) => state.cameraId);
  const microphoneId = useRoomStore((state) => state.microphoneId);
  const speakerId = useRoomStore((state) => state.speakerId);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  // Arrived from the Home "Share screen" tile (?share=1): offer to start sharing.
  const [isShareOfferShown, setIsShareOfferShown] = useState(
    () => new URLSearchParams(window.location.search).get("share") === "1",
  );

  // Step 2
  const hasMedia = STATUSES_WITH_MEDIA.includes(status);
  const media = useLocalMedia({
    isMicOn: isMicOn && hasMedia,
    isCameraOn: isCameraOn && hasMedia,
    cameraId,
    microphoneId,
  });
  useMediaErrorToasts(media.videoError, media.audioError);
  const devices = useMediaDevices(media.videoTrack !== null || media.audioTrack !== null);
  const recording = useLocalRecording(session.meetingCode, media.audioTrack);

  // Step 3
  const localTracks: LocalTracks = {
    audio: media.audioTrack,
    camera: media.videoTrack,
    screen: screenTrack,
  };
  const actions = useRoomConnection(session, localTracks);
  const screenShare = useScreenShare(actions);

  const me = participants.find(
    (participant) => participant.participant_id === session.participantId,
  );
  const myRole = me?.role ?? session.role;
  const others = participants.filter((participant) => participant !== me);
  const sharer = participants.find((participant) => participant.is_screen_sharing);
  const isShareAllowed = settings?.screen_share !== "host_only" || myRole !== "attendee";
  const canShareScreen = canBrowserShareScreen() && sharer === undefined && isShareAllowed;

  // When the meeting ends, show its summary.
  useEffect(() => {
    if (status === "ended") {
      clearMeetingSession(session.meetingCode);
      void queryClient.invalidateQueries({ queryKey: queryKeys.allMeetingLists });
      router.replace(`/room/${session.meetingCode}/ended?reason=ended`);
    }
  }, [status, session.meetingCode, queryClient, router]);

  function leave(destination: string) {
    screenShare.stopSharing();
    actions.leave();
    clearMeetingSession(session.meetingCode);
    void queryClient.invalidateQueries({ queryKey: queryKeys.allMeetingLists });
    router.push(destination);
  }

  function requestLeave() {
    // Like Zoom, the host picks a new host before leaving a meeting that carries on.
    if (myRole === "host" && others.length > 0) {
      setIsLeaveDialogOpen(true);
    } else {
      leave(`/room/${session.meetingCode}/ended?reason=left`);
    }
  }

  function assignHostAndLeave(newHostId: number) {
    actions.send({ type: "make_host", participant_id: newHostId });
    leave(`/room/${session.meetingCode}/ended?reason=left`);
  }

  // Each control in one place, used by both the toolbar and the keyboard shortcuts.
  const controls = {
    toggleMic: () => useRoomStore.getState().setMicOn(!isMicOn),
    toggleCamera: () => useRoomStore.getState().setCameraOn(!isCameraOn),
    toggleShare: () => {
      if (screenTrack !== null) {
        screenShare.stopSharing();
      } else if (canShareScreen) {
        void screenShare.startSharing();
      }
    },
    toggleHand: () => {
      if (me?.hand_raised_at == null) {
        actions.send({ type: "raise_hand" });
      } else {
        actions.send({ type: "lower_hand", participant_id: null });
      }
    },
    toggleChat: () => togglePanel("chat"),
    toggleParticipants: () => togglePanel("participants"),
    showShortcuts: () => setIsShortcutsOpen(true),
  };

  function togglePanel(panel: "chat" | "participants") {
    useRoomStore.getState().setOpenPanel(openPanel === panel ? null : panel);
  }

  useMeetingShortcuts({
    actions: controls,
    isMicOn,
    setMicOn: (isOn) => useRoomStore.getState().setMicOn(isOn),
  });

  // Step 4
  if (status !== "connected" && status !== "reconnecting") {
    return (
      <RoomStatusScreen
        status={status}
        statusMessage={statusMessage}
        rejoinPath={session.rejoinPath}
        meetingTitle={meeting?.title}
        onLeaveWaitingRoom={() => leave("/")}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-room text-white">
      <RoomHeader
        meetingCode={session.meetingCode}
        meeting={meeting}
        isRecording={recording.isRecording}
      />
      {status === "reconnecting" && (
        <p role="status" className="bg-zoom-orange py-1 text-center text-sm font-medium">
          Reconnecting…
        </p>
      )}
      {isShareOfferShown && screenTrack === null && (
        <div className="flex items-center justify-center gap-3 bg-white/10 py-2 text-sm">
          Ready to share your screen?
          <Button
            size="sm"
            disabled={!canShareScreen}
            onClick={() => {
              setIsShareOfferShown(false);
              void screenShare.startSharing();
            }}
          >
            Share screen
          </Button>
          <button type="button" onClick={() => setIsShareOfferShown(false)} className="underline">
            Not now
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          <RoomStage
            myParticipantId={session.participantId}
            localTracks={localTracks}
            isMirrored={preferences.mirrorMyVideo}
            onStopSharing={screenShare.stopSharing}
          />
        </main>
        {openPanel === "participants" && (
          <ParticipantsPanel
            myParticipantId={session.participantId}
            actions={actions}
            invitation={meeting?.invitation}
          />
        )}
        {openPanel === "chat" && (
          <ChatPanel myParticipantId={session.participantId} actions={actions} />
        )}
      </div>

      <RemoteAudio speakerId={speakerId} />
      <RoomToolbar
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        isSharingScreen={screenTrack !== null}
        canShareScreen={canShareScreen}
        isHandRaised={me?.hand_raised_at != null}
        isHost={myRole === "host"}
        isRecording={recording.isRecording}
        devices={devices}
        onToggleMic={controls.toggleMic}
        onToggleCamera={controls.toggleCamera}
        onToggleScreenShare={controls.toggleShare}
        onReact={(emoji) => actions.send({ type: "reaction", emoji })}
        onToggleHand={controls.toggleHand}
        onToggleRecording={() => {
          if (recording.isRecording) {
            recording.stopRecording();
          } else {
            void recording.startRecording();
          }
        }}
        onShowShortcuts={controls.showShortcuts}
        onLeave={requestLeave}
        onEndForEveryone={() => actions.send({ type: "end_meeting" })}
      />
      <HostLeaveDialog
        isOpen={isLeaveDialogOpen}
        candidates={others}
        onClose={() => setIsLeaveDialogOpen(false)}
        onAssignAndLeave={assignHostAndLeave}
      />
      <ShortcutsDialog isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </div>
  );
}

type RoomStageProps = {
  myParticipantId: number;
  localTracks: LocalTracks;
  isMirrored: boolean;
  onStopSharing: () => void;
};

/** The video area: the share layout while someone shares, else gallery or speaker view. */
function RoomStage({ myParticipantId, localTracks, isMirrored, onStopSharing }: RoomStageProps) {
  const layout = useRoomStore((state) => state.layout);
  const participants = useRoomStore((state) => state.participants);
  const sharer = participants.find((participant) => participant.is_screen_sharing);
  const viewProps = { myParticipantId, localTracks, isMirrored };

  if (sharer !== undefined) {
    return <ScreenShareView sharer={sharer} onStopSharing={onStopSharing} {...viewProps} />;
  }
  if (layout === "speaker") {
    return <SpeakerView {...viewProps} />;
  }
  return <GalleryView {...viewProps} />;
}

type RoomStatusScreenProps = {
  status: Exclude<RoomStatus, "connected" | "reconnecting">;
  statusMessage: string | null;
  rejoinPath: string;
  meetingTitle: string | undefined;
  onLeaveWaitingRoom: () => void;
};

/** What to show when we're not (or no longer) in the meeting. */
function RoomStatusScreen({
  status,
  statusMessage,
  rejoinPath,
  meetingTitle,
  onLeaveWaitingRoom,
}: RoomStatusScreenProps) {
  const homeLink = <RoomMessageLink href="/">Back to Home</RoomMessageLink>;
  const rejoinLink = (
    <RoomMessageLink href={rejoinPath} isPrimary>
      Rejoin
    </RoomMessageLink>
  );

  if (status === "connecting") {
    return <RoomMessage title="Connecting to the meeting…" />;
  }
  if (status === "waiting") {
    return (
      <RoomMessage
        isPulsing
        title="Please wait, the meeting host will let you in soon."
        message={meetingTitle}
        actions={<RoomMessageButton onClick={onLeaveWaitingRoom}>Leave</RoomMessageButton>}
      />
    );
  }
  if (status === "ended") {
    return <RoomMessage title="This meeting has ended" actions={homeLink} />;
  }
  if (status === "removed") {
    const title =
      statusMessage === "denied"
        ? "The host didn't let you into this meeting"
        : "The host has removed you from this meeting";
    return <RoomMessage title={title} actions={homeLink} />;
  }
  if (status === "refused") {
    // The server's reason is the headline ("You've left this meeting…").
    return (
      <RoomMessage
        title={statusMessage ?? "You can't join right now"}
        actions={
          <>
            {rejoinLink}
            {homeLink}
          </>
        }
      />
    );
  }
  return (
    <RoomMessage
      title="Connection lost"
      message={statusMessage}
      actions={
        <>
          {rejoinLink}
          {homeLink}
        </>
      }
    />
  );
}

/** A toast when the camera or microphone can't be opened, once per problem. */
function useMediaErrorToasts(videoError: MediaErrorKind | null, audioError: MediaErrorKind | null) {
  useEffect(() => {
    if (videoError !== null) {
      toast.error(`Camera: ${MEDIA_ERROR_MESSAGES[videoError]}`);
    }
  }, [videoError]);
  useEffect(() => {
    if (audioError !== null) {
      toast.error(`Microphone: ${MEDIA_ERROR_MESSAGES[audioError]}`);
    }
  }, [audioError]);
}

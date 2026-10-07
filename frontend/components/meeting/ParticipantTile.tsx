/**
 * One person's tile in the meeting: their camera (or their initials, when the camera is
 * off), their name and a muted-mic icon in the corner, a raised-hand badge, reactions
 * floating up, and a green outline while they speak.
 *
 * Sound is NOT played here (the video is muted): components/meeting/RemoteAudio.tsx
 * plays each person exactly once, however the tiles are arranged.
 */

"use client";

import { MicOff } from "lucide-react";
import { useEffect } from "react";

import { getInitials } from "@/components/ui/Avatar";
import { useIsSpeaking } from "@/hooks/useIsSpeaking";
import type { LocalTracks } from "@/lib/roomConnection";
import type { RosterEntry } from "@/lib/roomProtocol";
import { useRoomStore } from "@/stores/roomStore";

import { TrackVideo } from "./TrackVideo";

export type ParticipantTileProps = {
  participant: RosterEntry;
  isMe: boolean;
  /** My own camera and microphone (only used when isMe). */
  localTracks: LocalTracks;
  /** Show my own video mirrored (a Settings preference). */
  isMirrored: boolean;
  size: "large" | "small";
};

const INITIALS_SIZE_CLASSES = {
  large: "h-20 w-20 text-2xl md:h-24 md:w-24 md:text-3xl",
  small: "h-10 w-10 text-sm",
};

export function ParticipantTile({
  participant,
  isMe,
  localTracks,
  isMirrored,
  size,
}: ParticipantTileProps) {
  const participantId = participant.participant_id;
  const remoteStream = useRoomStore((state) => state.remoteStreams[participantId]);
  const allReactions = useRoomStore((state) => state.reactions);
  const setActiveSpeaker = useRoomStore((state) => state.setActiveSpeaker);
  const reactions = allReactions.filter((reaction) => reaction.participantId === participantId);

  let videoTrack = firstTrack(remoteStream, "video");
  let audioTrack = firstTrack(remoteStream, "audio");
  if (isMe) {
    videoTrack = localTracks.camera;
    audioTrack = localTracks.audio;
  }
  // While someone shares their screen, their video slot carries the screen (shown in
  // the share view), so their tile shows their initials instead.
  const showsCamera =
    participant.is_camera_on && !participant.is_screen_sharing && videoTrack !== null;
  const isSpeaking = useIsSpeaking(participant.is_mic_on ? audioTrack : null);

  // Speaker view follows whoever spoke last (other people only, like Zoom).
  useEffect(() => {
    if (isSpeaking && !isMe) {
      setActiveSpeaker(participantId);
    }
  }, [isSpeaking, isMe, participantId, setActiveSpeaker]);

  return (
    <div
      role="group"
      aria-label={isMe ? `${participant.display_name} (you)` : participant.display_name}
      className="relative h-full w-full overflow-hidden rounded-lg bg-room-tile"
    >
      {showsCamera ? (
        <TrackVideo track={videoTrack} isMirrored={isMe && isMirrored} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <span
            className={`flex items-center justify-center rounded-full bg-white/15 font-semibold ${INITIALS_SIZE_CLASSES[size]}`}
            aria-hidden
          >
            {getInitials(participant.display_name)}
          </span>
        </div>
      )}

      {participant.hand_raised_at !== null && (
        <span
          className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-sm"
          role="img"
          aria-label="Hand raised"
        >
          ✋
        </span>
      )}

      {reactions.map((reaction) => (
        <span
          key={reaction.id}
          className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 animate-float-up text-4xl"
          aria-hidden
        >
          {reaction.emoji}
        </span>
      ))}

      <div className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs">
        {!participant.is_mic_on && (
          <MicOff size={12} className="shrink-0 text-zoom-red" aria-label="Muted" />
        )}
        <span className="truncate">{participant.display_name}</span>
      </div>

      {isSpeaking && (
        <div
          className="pointer-events-none absolute inset-0 rounded-lg border-2 border-zoom-green"
          aria-hidden
        />
      )}
    </div>
  );
}

/** The first audio or video track in a stream, or null if there's none (yet). */
export function firstTrack(
  stream: MediaStream | undefined,
  kind: "audio" | "video",
): MediaStreamTrack | null {
  if (stream === undefined) {
    return null;
  }
  const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
  return tracks[0] ?? null;
}

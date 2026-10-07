/**
 * Shown to everyone while someone shares their screen (Zoom switches to this layout by
 * itself): the shared screen large, and everyone's tiles in a strip across the top.
 *
 * The sharer doesn't see their own screen inside itself (an endless mirror); they see
 * "You're sharing your screen" and a Stop button instead, like Zoom.
 */

"use client";

import { MonitorUp } from "lucide-react";

import { Button } from "@/components/ui/Button";
import type { RosterEntry } from "@/lib/roomProtocol";
import { useRoomStore } from "@/stores/roomStore";

import type { RoomViewProps } from "./GalleryView";
import { firstTrack, ParticipantTile } from "./ParticipantTile";
import { TrackVideo } from "./TrackVideo";

type ScreenShareViewProps = RoomViewProps & {
  sharer: RosterEntry;
  onStopSharing: () => void;
};

export function ScreenShareView({
  sharer,
  myParticipantId,
  localTracks,
  isMirrored,
  onStopSharing,
}: ScreenShareViewProps) {
  const participants = useRoomStore((state) => state.participants);
  const sharerStream = useRoomStore((state) => state.remoteStreams[sharer.participant_id]);
  const isMeSharing = sharer.participant_id === myParticipantId;

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex shrink-0 justify-center gap-2 overflow-x-auto">
        {participants.map((participant) => (
          <div key={participant.participant_id} className="aspect-video w-32 shrink-0 md:w-40">
            <ParticipantTile
              participant={participant}
              isMe={participant.participant_id === myParticipantId}
              localTracks={localTracks}
              isMirrored={isMirrored}
              size="small"
            />
          </div>
        ))}
      </div>

      <section
        aria-label={`${sharer.display_name}'s screen`}
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black"
      >
        {isMeSharing ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <MonitorUp size={40} className="text-zoom-green" aria-hidden />
            <p className="text-lg font-semibold">You&apos;re sharing your screen</p>
            <Button variant="danger" onClick={onStopSharing}>
              Stop share
            </Button>
          </div>
        ) : (
          <TrackVideo track={firstTrack(sharerStream, "video")} fit="contain" />
        )}
        <span className="absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs">
          {isMeSharing ? "Your screen" : `${sharer.display_name}'s screen`}
        </span>
      </section>
    </div>
  );
}

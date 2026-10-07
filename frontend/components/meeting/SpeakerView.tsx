/**
 * Speaker view: one person large (whoever spoke last), everyone else in a strip of
 * small tiles across the top, like Zoom.
 */

"use client";

import type { RosterEntry } from "@/lib/roomProtocol";
import { useRoomStore } from "@/stores/roomStore";

import type { RoomViewProps } from "./GalleryView";
import { ParticipantTile } from "./ParticipantTile";
import { VideoFrame } from "./VideoFrame";

export function SpeakerView({ myParticipantId, localTracks, isMirrored }: RoomViewProps) {
  const participants = useRoomStore((state) => state.participants);
  const activeSpeakerId = useRoomStore((state) => state.activeSpeakerId);
  const featured = pickFeatured(participants, activeSpeakerId, myParticipantId);
  if (featured === undefined) {
    return null;
  }
  const everyoneElse = participants.filter(
    (participant) => participant.participant_id !== featured.participant_id,
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {everyoneElse.length > 0 && (
        <div className="flex shrink-0 justify-center gap-2 overflow-x-auto">
          {everyoneElse.map((participant) => (
            <div key={participant.participant_id} className="aspect-video w-36 shrink-0 md:w-44">
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
      )}
      <div className="min-h-0 flex-1">
        <VideoFrame>
          <ParticipantTile
            participant={featured}
            isMe={featured.participant_id === myParticipantId}
            localTracks={localTracks}
            isMirrored={isMirrored}
            size="large"
          />
        </VideoFrame>
      </div>
    </div>
  );
}

/**
 * Who to show large: the last person who spoke; before anyone has spoken, the first
 * other person; when I'm alone, me.
 */
function pickFeatured(
  participants: RosterEntry[],
  activeSpeakerId: number | null,
  myParticipantId: number,
): RosterEntry | undefined {
  const activeSpeaker = participants.find(
    (participant) => participant.participant_id === activeSpeakerId,
  );
  if (activeSpeaker !== undefined) {
    return activeSpeaker;
  }
  const someoneElse = participants.find(
    (participant) => participant.participant_id !== myParticipantId,
  );
  return someoneElse ?? participants[0];
}

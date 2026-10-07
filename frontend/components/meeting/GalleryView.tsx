/**
 * Gallery view: everyone (including me) as equal 16:9 tiles, as large as the screen
 * allows.
 *
 * How many columns? We try every possible column count and keep the one that gives the
 * biggest tiles for this screen's shape. On a wide laptop, 2 people sit side by side;
 * on a tall phone, they stack. A short last row is centred, like Zoom's.
 */

"use client";

import { useElementSize } from "@/hooks/useElementSize";
import { useRoomStore } from "@/stores/roomStore";

import { ParticipantTile, type ParticipantTileProps } from "./ParticipantTile";
import { VideoFrame } from "./VideoFrame";

export type RoomViewProps = {
  myParticipantId: number;
  localTracks: ParticipantTileProps["localTracks"];
  isMirrored: boolean;
};

const TILE_ASPECT_RATIO = 16 / 9;

export function GalleryView({ myParticipantId, localTracks, isMirrored }: RoomViewProps) {
  const participants = useRoomStore((state) => state.participants);
  const { ref, size } = useElementSize<HTMLDivElement>();
  const columns = bestColumnCount(participants.length, size.width, size.height);
  const rows = Math.max(1, Math.ceil(participants.length / columns));

  // Each cell is 1/columns wide and 1/rows tall. A wrapping, centred row (rather than a
  // CSS grid) puts a short last row in the middle: 3 people → 2 on top, 1 centred below.
  const cellSize = { width: `${100 / columns}%`, height: `${100 / rows}%` };
  return (
    <div ref={ref} className="flex h-full flex-wrap content-center justify-center p-1">
      {participants.map((participant) => (
        <div key={participant.participant_id} className="p-1" style={cellSize}>
          <VideoFrame>
            <ParticipantTile
              participant={participant}
              isMe={participant.participant_id === myParticipantId}
              localTracks={localTracks}
              isMirrored={isMirrored}
              size="large"
            />
          </VideoFrame>
        </div>
      ))}
    </div>
  );
}

/**
 * The column count that makes `count` 16:9 tiles as wide as possible in a
 * width × height area. Each tile is limited by its column's width or its row's height,
 * whichever runs out first.
 */
function bestColumnCount(count: number, width: number, height: number): number {
  let bestColumns = 1;
  let bestTileWidth = 0;
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const tileWidth = Math.min(width / columns, (height / rows) * TILE_ASPECT_RATIO);
    if (tileWidth > bestTileWidth) {
      bestTileWidth = tileWidth;
      bestColumns = columns;
    }
  }
  return bestColumns;
}

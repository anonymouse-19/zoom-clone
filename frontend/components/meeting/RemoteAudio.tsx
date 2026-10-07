/**
 * Plays every other participant's sound, once each, through the speaker chosen on the
 * pre-join screen.
 *
 * Kept apart from the video tiles on purpose: switching between gallery and speaker
 * view re-creates tiles, and a tile could even appear twice. Audio living here means
 * nobody's voice is cut off or doubled when the layout changes. My own microphone is
 * never played back to me, so there's no echo.
 */

"use client";

import { useEffect, useRef } from "react";

import { useRoomStore } from "@/stores/roomStore";

/** `setSinkId` (choose the output device) exists only in some browsers; written out
 * here because TypeScript's DOM types don't include it everywhere yet. */
type AudioElementWithSink = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };

export function RemoteAudio({ speakerId }: { speakerId: string }) {
  const remoteStreams = useRoomStore((state) => state.remoteStreams);
  return (
    <>
      {Object.entries(remoteStreams).map(([participantId, stream]) => (
        <StreamAudio key={participantId} stream={stream} speakerId={speakerId} />
      ))}
    </>
  );
}

function StreamAudio({ stream, speakerId }: { stream: MediaStream; speakerId: string }) {
  const audioRef = useRef<AudioElementWithSink>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null) {
      return;
    }
    audio.srcObject = stream;
    // "" means the default speaker, which needs no call.
    if (speakerId !== "" && audio.setSinkId) {
      audio.setSinkId(speakerId).catch(() => {
        // The chosen speaker was unplugged: the default one keeps playing.
      });
    }
  }, [stream, speakerId]);

  return <audio ref={audioRef} autoPlay />;
}

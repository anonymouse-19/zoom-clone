/**
 * How loud the microphone is right now, from 0 (silence) to 1 (loud), updated every
 * animation frame (~60 times a second) for a smooth meter.
 *
 * Called by: components/prejoin/MicLevelMeter.tsx. The measuring itself is in
 * lib/audioLevel.ts (shared with useIsSpeaking).
 */

import { useEffect, useState } from "react";

import { startAudioLevelReader } from "@/lib/audioLevel";

export function useMicLevel(track: MediaStreamTrack | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (track === null) {
      return;
    }
    const reader = startAudioLevelReader(track);
    let frameId = 0;
    function measure() {
      setLevel(reader.readLevel());
      frameId = requestAnimationFrame(measure);
    }
    frameId = requestAnimationFrame(measure);

    // Cleanup: stop the loop and release the audio graph when the track changes.
    return () => {
      cancelAnimationFrame(frameId);
      reader.stop();
    };
  }, [track]);

  return track === null ? 0 : level;
}

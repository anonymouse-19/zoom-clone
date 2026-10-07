/**
 * Whether someone is talking on this audio track right now: drives the green
 * "speaking" outline on video tiles, and who speaker view shows large.
 *
 * Checks a few times a second (not every frame like the mic meter), and re-renders
 * only when the answer changes, so a room full of tiles stays cheap.
 */

import { useEffect, useState } from "react";

import { startAudioLevelReader } from "@/lib/audioLevel";

const CHECK_INTERVAL_MS = 150;
// Louder than this counts as speech (on the 0–1 scale of lib/audioLevel.ts); quieter
// is background noise.
const SPEAKING_LEVEL = 0.12;
// Stay "speaking" this long after the last loud moment, through the gaps between
// words, so the outline doesn't flicker.
const SPEAKING_HOLD_MS = 600;

export function useIsSpeaking(track: MediaStreamTrack | null): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (track === null) {
      return;
    }
    const reader = startAudioLevelReader(track);
    let lastHeardAt = 0;
    const timer = setInterval(() => {
      const now = Date.now();
      if (reader.readLevel() >= SPEAKING_LEVEL) {
        lastHeardAt = now;
      }
      // Setting the same value again doesn't re-render.
      setIsSpeaking(now - lastHeardAt < SPEAKING_HOLD_MS);
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      reader.stop();
    };
  }, [track]);

  return track === null ? false : isSpeaking;
}

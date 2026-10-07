/**
 * A <video> element showing one video track: the pre-join preview, and the meeting
 * room's tiles (Phase 5).
 *
 * The <video> is always muted: it only shows pictures. Sound is played separately, so
 * your own microphone is never played back to you (no echo).
 */

"use client";

import { useEffect, useRef } from "react";

type TrackVideoProps = {
  track: MediaStreamTrack | null;
  /** Flip horizontally, like a mirror. Used only for your own camera. */
  isMirrored?: boolean;
  /** "cover" fills the box (cameras); "contain" shows all of it (shared screens). */
  fit?: "cover" | "contain";
  className?: string;
};

const FIT_CLASSES = { cover: "object-cover", contain: "object-contain" };

export function TrackVideo({
  track,
  isMirrored = false,
  fit = "cover",
  className = "",
}: TrackVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // A <video> plays a MediaStream, not a bare track, so wrap the track in one.
  useEffect(() => {
    const video = videoRef.current;
    if (video !== null) {
      video.srcObject = track ? new MediaStream([track]) : null;
    }
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`h-full w-full ${FIT_CLASSES[fit]} ${isMirrored ? "-scale-x-100" : ""} ${className}`}
    />
  );
}

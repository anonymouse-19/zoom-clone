/**
 * The big video preview on the pre-join screen, with the mic and camera toggles laid over
 * it (Zoom / Google Meet "green room" style).
 *
 * Shows, depending on state:
 * - your camera, mirrored if you chose that in Settings;
 * - your initials when the camera is off;
 * - a plain explanation when the camera or microphone can't be used (e.g. permission
 *   denied), so you can still join without it.
 */

"use client";

import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import type { ReactNode } from "react";

import { TrackVideo } from "@/components/meeting/TrackVideo";
import { getInitials } from "@/components/ui/Avatar";
import { MEDIA_ERROR_MESSAGES, type MediaErrorKind } from "@/lib/media";

type DevicePreviewProps = {
  displayName: string;
  videoTrack: MediaStreamTrack | null;
  isCameraOn: boolean;
  isMicOn: boolean;
  isMirrored: boolean;
  videoError: MediaErrorKind | null;
  audioError: MediaErrorKind | null;
  onToggleCamera: () => void;
  onToggleMic: () => void;
};

export function DevicePreview({
  displayName,
  videoTrack,
  isCameraOn,
  isMicOn,
  isMirrored,
  videoError,
  audioError,
  onToggleCamera,
  onToggleMic,
}: DevicePreviewProps) {
  const showVideo = isCameraOn && videoTrack !== null;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-room-tile">
      {showVideo ? (
        <TrackVideo track={videoTrack} isMirrored={isMirrored} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <span className="grid h-24 w-24 place-items-center rounded-full bg-zoom-blue text-3xl font-semibold text-white">
            {getInitials(displayName || "?")}
          </span>
        </div>
      )}

      {(videoError || audioError) && (
        <div className="absolute inset-x-3 top-3 rounded-lg bg-black/70 px-3 py-2 text-xs text-white">
          {videoError && <p>Camera: {MEDIA_ERROR_MESSAGES[videoError]}</p>}
          {audioError && <p>Microphone: {MEDIA_ERROR_MESSAGES[audioError]}</p>}
          <p className="mt-1 text-white/70">You can still join and turn them on later.</p>
        </div>
      )}

      <span className="absolute bottom-3 left-3 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        {displayName || "You"}
      </span>

      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">
        <PreviewToggle
          isOn={isMicOn}
          onClick={onToggleMic}
          labelWhenOn="Mute"
          labelWhenOff="Unmute"
          iconOn={<Mic size={20} aria-hidden />}
          iconOff={<MicOff size={20} aria-hidden />}
        />
        <PreviewToggle
          isOn={isCameraOn}
          onClick={onToggleCamera}
          labelWhenOn="Stop video"
          labelWhenOff="Start video"
          iconOn={<Video size={20} aria-hidden />}
          iconOff={<VideoOff size={20} aria-hidden />}
        />
      </div>
    </div>
  );
}

type PreviewToggleProps = {
  isOn: boolean;
  onClick: () => void;
  labelWhenOn: string;
  labelWhenOff: string;
  iconOn: ReactNode;
  iconOff: ReactNode;
};

/** A round button: dark when on, red when off (Zoom's convention for mic/camera). */
function PreviewToggle({
  isOn,
  onClick,
  labelWhenOn,
  labelWhenOff,
  iconOn,
  iconOff,
}: PreviewToggleProps) {
  const label = isOn ? labelWhenOn : labelWhenOff;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={!isOn}
      className={`grid h-11 w-11 place-items-center rounded-full text-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
        isOn ? "bg-black/60 hover:bg-black/80" : "bg-zoom-red hover:bg-zoom-red-hover"
      }`}
    >
      {isOn ? iconOn : iconOff}
    </button>
  );
}

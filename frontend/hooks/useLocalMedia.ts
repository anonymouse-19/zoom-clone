/**
 * The local camera and microphone, as two independent tracks.
 *
 * Called by: the pre-join screen (Phase 4) and the meeting room (Phase 5).
 * Side effects: opens the camera/microphone (getUserMedia) and stops them again.
 *
 * Why two separate tracks instead of one combined stream: turning the camera off must
 * really release it (the camera light goes off) without interrupting the microphone,
 * and switching cameras must not re-ask for the mic.
 */

import { useEffect, useState } from "react";

import {
  classifyMediaError,
  deviceConstraint,
  type CameraFacing,
  type MediaErrorKind,
} from "@/lib/media";

type TrackKind = "audio" | "video";

type LocalTrackState = {
  track: MediaStreamTrack | null;
  error: MediaErrorKind | null;
};

/**
 * One local track. While `isOn`, keeps a live track from `deviceId` ("" = default, or the
 * front/back camera given by `facing`); when turned off, or when the device changes, the
 * old track is stopped first (phones can't keep two cameras open at once).
 */
export function useLocalTrack(
  kind: TrackKind,
  isOn: boolean,
  deviceId: string,
  facing: CameraFacing | null = null,
): LocalTrackState {
  const [state, setState] = useState<LocalTrackState>({ track: null, error: null });

  useEffect(() => {
    if (!isOn) {
      return;
    }
    // INTERVIEW: the cleanup below can run while getUserMedia is still pending (e.g.
    // the user toggles the camera off quickly). `isCancelled` makes sure a track that
    // arrives late is stopped at once, instead of leaking with the camera light on.
    let isCancelled = false;
    let acquiredTrack: MediaStreamTrack | null = null;

    async function acquire() {
      try {
        const constraints = { [kind]: deviceConstraint(deviceId, facing) };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        acquiredTrack = stream.getTracks()[0];
        if (isCancelled) {
          acquiredTrack.stop();
          return;
        }
        setState({ track: acquiredTrack, error: null });
      } catch (error) {
        if (!isCancelled) {
          setState({ track: null, error: classifyMediaError(error) });
        }
      }
    }

    void acquire();
    return () => {
      isCancelled = true;
      acquiredTrack?.stop();
    };
  }, [kind, isOn, deviceId, facing]);

  // When turned off, report "no track" right away (the effect cleanup has stopped it).
  return isOn ? state : { track: null, error: null };
}

/** Camera + microphone together. Each can be on/off and pointed at a device. */
export function useLocalMedia(options: {
  isCameraOn: boolean;
  isMicOn: boolean;
  cameraId: string;
  microphoneId: string;
  /** Front or back camera, when chosen with the switch-camera button. */
  cameraFacing?: CameraFacing | null;
}) {
  const camera = useLocalTrack(
    "video",
    options.isCameraOn,
    options.cameraId,
    options.cameraFacing ?? null,
  );
  const microphone = useLocalTrack("audio", options.isMicOn, options.microphoneId);
  return {
    videoTrack: camera.track,
    audioTrack: microphone.track,
    videoError: camera.error,
    audioError: microphone.error,
  };
}

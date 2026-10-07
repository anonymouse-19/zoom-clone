/**
 * Small helpers around the browser's camera/microphone APIs (getUserMedia).
 *
 * Called by: hooks/useLocalMedia.ts and the pre-join screen's error messages.
 */

/** Why a camera or microphone couldn't be opened, in terms the UI can explain. */
export type MediaErrorKind = "permission-denied" | "no-device" | "in-use" | "unknown";

export const MEDIA_ERROR_MESSAGES: Record<MediaErrorKind, string> = {
  "permission-denied":
    "Access was blocked. Click the camera icon in your browser's address bar, allow access, then try again.",
  "no-device": "No device was found. Check that it's plugged in.",
  "in-use": "It's being used by another app. Close that app and try again.",
  unknown: "It couldn't be started. Try another device.",
};

/**
 * Turn a getUserMedia failure into one of our error kinds.
 * The browser reports these as DOMExceptions with a standard `name`.
 */
export function classifyMediaError(error: unknown): MediaErrorKind {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "permission-denied";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "no-device";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "in-use";
  }
  return "unknown";
}

/** A phone's front camera ("user", facing you) or back camera ("environment"). */
export type CameraFacing = "user" | "environment";

/**
 * Constraints asking for one specific device, or the default one when `deviceId` is "".
 * `exact` means "this device or fail", instead of silently picking another.
 * `facing` asks for the front or back camera instead (the phone's switch-camera button).
 * It's a preference, not `exact`: a device with one camera simply keeps using it.
 */
export function deviceConstraint(
  deviceId: string,
  facing: CameraFacing | null = null,
): MediaTrackConstraints | true {
  if (deviceId) {
    return { deviceId: { exact: deviceId } };
  }
  if (facing) {
    return { facingMode: facing };
  }
  return true;
}

/**
 * Whether the page is in fullscreen, and a function to toggle it (the meeting header's
 * fullscreen button).
 *
 * Reads the browser's own state with useSyncExternalStore, so pressing Esc (which leaves
 * fullscreen without our button) updates the icon too.
 */

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

function isFullscreenNow(): boolean {
  return document.fullscreenElement !== null;
}

function isFullscreenOnServer(): boolean {
  return false;
}

export function useFullscreen() {
  const isFullscreen = useSyncExternalStore(subscribe, isFullscreenNow, isFullscreenOnServer);

  function toggleFullscreen() {
    if (isFullscreenNow()) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }

  return { isFullscreen, toggleFullscreen };
}

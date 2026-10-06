/**
 * The cameras, microphones and speakers this computer has, kept up to date when a device
 * is plugged in or removed.
 *
 * Note: browsers hide device *names* until the page has been given camera/mic permission.
 * The labels fill in once a track has been opened, which is why callers pass
 * `hasPermission` (it re-reads the list when that flips to true).
 */

import { useEffect, useState } from "react";

export type DeviceLists = {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
};

const EMPTY_LISTS: DeviceLists = { cameras: [], microphones: [], speakers: [] };

function splitByKind(devices: MediaDeviceInfo[]): DeviceLists {
  return {
    cameras: devices.filter((device) => device.kind === "videoinput"),
    microphones: devices.filter((device) => device.kind === "audioinput"),
    speakers: devices.filter((device) => device.kind === "audiooutput"),
  };
}

export function useMediaDevices(hasPermission: boolean): DeviceLists {
  const [lists, setLists] = useState<DeviceLists>(EMPTY_LISTS);

  useEffect(() => {
    let isActive = true;
    async function refreshDevices() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (isActive) {
        setLists(splitByKind(devices));
      }
    }
    void refreshDevices();
    // "devicechange" fires when a headset or webcam is plugged in or removed.
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      isActive = false;
      navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
    };
  }, [hasPermission]);

  return lists;
}

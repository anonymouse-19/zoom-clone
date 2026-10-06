/**
 * A labelled dropdown for choosing a camera, microphone or speaker.
 * The empty value means "use the browser's default device".
 */

"use client";

import type { ReactNode } from "react";

type DeviceSelectProps = {
  label: string;
  icon: ReactNode;
  devices: MediaDeviceInfo[];
  selectedId: string;
  onChange: (deviceId: string) => void;
};

export function DeviceSelect({ label, icon, devices, selectedId, onChange }: DeviceSelectProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
      <span className="flex items-center gap-1.5">
        {icon} {label}
      </span>
      <select
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink focus:border-zoom-blue focus:outline-none"
      >
        <option value="">System default</option>
        {devices
          // Some browsers list a "default" pseudo-device; our "" option already covers it.
          .filter((device) => device.deviceId !== "default" && device.deviceId !== "")
          .map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {/* Labels stay empty until the page has permission to use the devices. */}
              {device.label || `${label} ${index + 1}`}
            </option>
          ))}
      </select>
    </label>
  );
}

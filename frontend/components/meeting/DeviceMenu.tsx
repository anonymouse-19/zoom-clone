/**
 * The small ^ next to Mute and Stop Video: pick which microphone / speaker / camera to
 * use, without leaving the meeting (like Zoom's toolbar).
 *
 * Choosing a device updates the room store; useLocalMedia then opens the new device, and
 * the connection swaps the new track into every call (replaceTrack, no renegotiation).
 */

"use client";

import { Check, ChevronUp } from "lucide-react";
import { Fragment } from "react";

import { Dropdown, DropdownDivider, DropdownItem } from "@/components/ui/Dropdown";

export type DeviceSection = {
  title: string;
  devices: MediaDeviceInfo[];
  /** "" = the browser's default device. */
  selectedId: string;
  onSelect: (deviceId: string) => void;
};

type DeviceMenuProps = {
  /** "Audio" or "Video", for the button's accessible name. */
  label: string;
  sections: DeviceSection[];
};

export function DeviceMenu({ label, sections }: DeviceMenuProps) {
  return (
    <Dropdown
      trigger={<ChevronUp size={14} aria-hidden />}
      triggerAriaLabel={`${label} settings`}
      triggerClassName="-ml-2 self-start rounded p-0.5 text-white/70 hover:bg-white/10 hover:text-white"
      align="left"
      opens="above"
    >
      {sections.map((section, sectionIndex) => (
        <Fragment key={section.title}>
          {sectionIndex > 0 && <DropdownDivider />}
          <p className="px-4 pt-1 pb-1 text-xs font-semibold text-ink-muted">{section.title}</p>
          {section.devices.length === 0 && (
            <p className="px-4 py-1 text-sm text-ink-muted">No devices found</p>
          )}
          {section.devices.map((device, deviceIndex) => (
            <DropdownItem key={device.deviceId} onSelect={() => section.onSelect(device.deviceId)}>
              <Check
                size={16}
                className={isSelected(section, device, deviceIndex) ? "" : "invisible"}
                aria-hidden
              />
              {device.label || `${section.title} ${deviceIndex + 1}`}
            </DropdownItem>
          ))}
        </Fragment>
      ))}
    </Dropdown>
  );
}

/** With no explicit choice, the first device in the list is the one in use. */
function isSelected(section: DeviceSection, device: MediaDeviceInfo, index: number): boolean {
  if (section.selectedId === "") {
    return index === 0;
  }
  return device.deviceId === section.selectedId;
}

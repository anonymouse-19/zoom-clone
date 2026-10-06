/**
 * Settings modal (gear icon or profile menu → Settings), with General / Audio / Video tabs.
 * Preferences are saved per browser (see lib/preferences.ts) and used when joining meetings.
 */

"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Toggle } from "@/components/ui/Toggle";
import { useCurrentUser } from "@/hooks/queries";
import { usePreferences } from "@/hooks/usePreferences";

type SettingsTab = "general" | "audio" | "video";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "audio", label: "Audio" },
  { id: "video", label: "Video" },
];

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { preferences, updatePreference } = usePreferences();
  const { data: user } = useCurrentUser();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" widthClass="max-w-lg">
      <Tabs
        tabs={SETTINGS_TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
        ariaLabel="Settings sections"
      />
      <div className="flex flex-col gap-5 py-5">
        {activeTab === "general" && (
          <div>
            <p className="text-sm font-medium">Time zone</p>
            <p className="mt-0.5 text-sm text-ink-muted">{user?.timezone ?? "…"}</p>
            <p className="mt-2 text-xs text-ink-muted">
              Meeting times are shown in your profile&apos;s time zone.
            </p>
          </div>
        )}
        {activeTab === "audio" && (
          <Toggle
            label="Mute my microphone when joining a meeting"
            isOn={preferences.joinMuted}
            onChange={(isOn) => updatePreference("joinMuted", isOn)}
          />
        )}
        {activeTab === "video" && (
          <>
            <Toggle
              label="Turn on my video when joining a meeting"
              isOn={preferences.startWithVideo}
              onChange={(isOn) => updatePreference("startWithVideo", isOn)}
            />
            <Toggle
              label="Mirror my video"
              description="Shows your own video like a mirror. Others always see it un-mirrored."
              isOn={preferences.mirrorMyVideo}
              onChange={(isOn) => updatePreference("mirrorMyVideo", isOn)}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

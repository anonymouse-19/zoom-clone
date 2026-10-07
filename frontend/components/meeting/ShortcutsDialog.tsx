/**
 * The keyboard shortcut cheat sheet: opened with "?" or More → Keyboard shortcuts.
 */

"use client";

import { Modal } from "@/components/ui/Modal";
import {
  SHORTCUT_DESCRIPTIONS,
  SHORTCUT_LABELS,
  type ShortcutAction,
} from "@/hooks/useMeetingShortcuts";

const ORDER: ShortcutAction[] = [
  "toggleMic",
  "toggleCamera",
  "toggleShare",
  "toggleChat",
  "toggleParticipants",
  "toggleHand",
  "showShortcuts",
];

export function ShortcutsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
        {ORDER.map((action) => (
          <ShortcutRow
            key={action}
            description={SHORTCUT_DESCRIPTIONS[action]}
            keys={SHORTCUT_LABELS[action]}
          />
        ))}
        <ShortcutRow description="Talk while muted (push-to-talk)" keys="Hold Space" />
      </dl>
    </Modal>
  );
}

function ShortcutRow({ description, keys }: { description: string; keys: string }) {
  return (
    <>
      <dt>{description}</dt>
      <dd>
        <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs">
          {keys}
        </kbd>
      </dd>
    </>
  );
}

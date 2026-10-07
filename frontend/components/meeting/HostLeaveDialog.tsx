/**
 * "Assign a new host": shown when the host chooses Leave (not End) while others are
 * still in the meeting. Like Zoom, the meeting can't be left without a host.
 */

"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { RosterEntry } from "@/lib/roomProtocol";

type HostLeaveDialogProps = {
  isOpen: boolean;
  /** Everyone who could become host (everyone but me). */
  candidates: RosterEntry[];
  onClose: () => void;
  onAssignAndLeave: (newHostId: number) => void;
};

export function HostLeaveDialog({
  isOpen,
  candidates,
  onClose,
  onAssignAndLeave,
}: HostLeaveDialogProps) {
  const [chosenId, setChosenId] = useState<number | null>(null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign a new host"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={chosenId === null}
            onClick={() => chosenId !== null && onAssignAndLeave(chosenId)}
          >
            Assign and leave
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-muted">
        Choose who will host the meeting after you leave.
      </p>
      <fieldset className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        <legend className="sr-only">New host</legend>
        {candidates.map((candidate) => (
          <label
            key={candidate.participant_id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-canvas"
          >
            <input
              type="radio"
              name="new-host"
              checked={chosenId === candidate.participant_id}
              onChange={() => setChosenId(candidate.participant_id)}
              className="accent-zoom-blue"
            />
            {candidate.display_name}
          </label>
        ))}
      </fieldset>
    </Modal>
  );
}

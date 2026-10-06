/**
 * "Are you sure?" dialog for destructive actions (e.g. deleting a meeting).
 * The confirm button is red, and it's disabled while the action runs, so a double-click
 * can't fire it twice.
 */

"use client";

import type { ReactNode } from "react";

import { Button } from "./Button";
import { Modal } from "./Modal";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  isWorking: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  isWorking,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isWorking}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isWorking}>
            {isWorking ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-muted">{message}</div>
    </Modal>
  );
}

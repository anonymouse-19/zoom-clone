/**
 * Email "chips" input for meeting invitees: type an address and press Enter, comma or
 * Tab (or click away) to turn it into a chip; Backspace on an empty box removes the last.
 * Addresses are lowercased and de-duplicated, matching what the server stores.
 */

"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

// The same simple shape check the server uses: something@something.something.
const SIMPLE_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const KEYS_THAT_ADD = new Set(["Enter", ",", "Tab"]);

type InviteesInputProps = {
  emails: string[];
  onChange: (emails: string[]) => void;
};

export function InviteesInput({ emails, onChange }: InviteesInputProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** Try to turn the typed text into a chip. Returns true if the box is now empty. */
  function addDraft(): boolean {
    const email = draft.trim().replace(/,$/, "").toLowerCase();
    if (email === "") {
      return true;
    }
    if (!SIMPLE_EMAIL_PATTERN.test(email)) {
      setError(`"${email}" isn't a valid email address`);
      return false;
    }
    if (!emails.includes(email)) {
      onChange([...emails, email]);
    }
    setDraft("");
    setError(null);
    return true;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Tab with an empty box should still move focus normally.
    if (KEYS_THAT_ADD.has(event.key) && draft.trim() !== "") {
      event.preventDefault();
      addDraft();
    } else if (event.key === "Backspace" && draft === "" && emails.length > 0) {
      onChange(emails.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 focus-within:border-zoom-blue">
        {emails.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 rounded-full bg-zoom-blue-soft px-2.5 py-0.5 text-xs text-zoom-blue"
          >
            {email}
            <button
              type="button"
              onClick={() => onChange(emails.filter((existing) => existing !== email))}
              aria-label={`Remove ${email}`}
              className="rounded-full hover:text-zoom-blue-hover"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addDraft}
          placeholder={emails.length === 0 ? "Enter email addresses" : ""}
          aria-label="Invitee email"
          className="min-w-40 flex-1 py-1 text-sm focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-zoom-red">
          {error}
        </p>
      )}
    </div>
  );
}

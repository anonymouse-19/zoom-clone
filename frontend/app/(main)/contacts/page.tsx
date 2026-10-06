/** "Contacts" tab: a placeholder; this product area is outside the project's scope. */

import { Contact } from "lucide-react";

import { ComingSoon } from "@/components/layout/ComingSoon";

export default function ContactsPage() {
  return (
    <ComingSoon
      title="Contacts"
      icon={Contact}
      description="Find colleagues, see who's available, and start a meeting in one click."
    />
  );
}

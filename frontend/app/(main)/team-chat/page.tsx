/** "Team Chat" tab: a placeholder; this product area is outside the project's scope. */

import { MessageSquare } from "lucide-react";

import { ComingSoon } from "@/components/layout/ComingSoon";

export default function TeamChatPage() {
  return (
    <ComingSoon
      title="Team Chat"
      icon={MessageSquare}
      description="Chat with your team in channels and direct messages, between meetings."
    />
  );
}

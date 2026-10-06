/** "Whiteboards" tab: a placeholder; this product area is outside the project's scope. */

import { Presentation } from "lucide-react";

import { ComingSoon } from "@/components/layout/ComingSoon";

export default function WhiteboardsPage() {
  return (
    <ComingSoon
      title="Whiteboards"
      icon={Presentation}
      description="Sketch and brainstorm together on an infinite canvas."
    />
  );
}

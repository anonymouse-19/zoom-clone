/**
 * The avatar at the top-right and its dropdown: who's signed in, their status, Settings,
 * and a Sign out placeholder (the app has no real login).
 */

"use client";

import { LogOut, Settings } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/Avatar";
import { Dropdown, DropdownDivider, DropdownItem } from "@/components/ui/Dropdown";
import { Skeleton } from "@/components/ui/Feedback";
import { useCurrentUser } from "@/hooks/queries";

export function ProfileMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data: user } = useCurrentUser();

  if (!user) {
    return <Skeleton className="h-8 w-8 rounded-full" />;
  }

  return (
    <Dropdown
      triggerAriaLabel="Profile menu"
      triggerClassName="rounded-full"
      trigger={<Avatar name={user.name} color={user.avatar_color} showPresence />}
    >
      <div className="flex items-center gap-3 px-4 pt-1 pb-3">
        <Avatar name={user.name} color={user.avatar_color} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{user.name}</p>
          <p className="truncate text-xs text-ink-muted">{user.email}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2 w-2 rounded-full bg-zoom-green" aria-hidden />
            Available
          </p>
        </div>
      </div>
      <DropdownDivider />
      <DropdownItem onSelect={onOpenSettings}>
        <Settings size={16} aria-hidden /> Settings
      </DropdownItem>
      <DropdownItem onSelect={() => toast.info("Sign out isn't available in this demo.")}>
        <LogOut size={16} aria-hidden /> Sign out
      </DropdownItem>
    </Dropdown>
  );
}

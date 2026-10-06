/**
 * The light top bar on every (main) page: logo, product tabs, search, settings, profile.
 *
 * Rendered by: app/(main)/layout.tsx.
 * Client component because it reads the current URL (to highlight the active tab) and
 * keeps the Settings modal's open/closed state.
 */

"use client";

import {
  CalendarClock,
  CalendarDays,
  Contact,
  House,
  MessageSquare,
  Presentation,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ProfileMenu } from "./ProfileMenu";
import { SettingsModal } from "./SettingsModal";
import { ZoomLogo } from "./ZoomLogo";

type NavTab = { label: string; href: string; icon: LucideIcon; isPlaceholder: boolean };

// Home and Meetings are real pages; the others show a "Coming soon" placeholder and are
// hidden on phones, where there's only room for the tabs that do something.
const NAV_TABS: NavTab[] = [
  { label: "Home", href: "/", icon: House, isPlaceholder: false },
  { label: "Team Chat", href: "/team-chat", icon: MessageSquare, isPlaceholder: true },
  { label: "Meetings", href: "/meetings", icon: CalendarClock, isPlaceholder: false },
  { label: "Scheduler", href: "/scheduler", icon: CalendarDays, isPlaceholder: true },
  { label: "Whiteboards", href: "/whiteboards", icon: Presentation, isPlaceholder: true },
  { label: "Contacts", href: "/contacts", icon: Contact, isPlaceholder: true },
];

/** "/" only matches exactly; other tabs also stay active on their sub-pages. */
function isTabActive(tabHref: string, pathname: string): boolean {
  if (tabHref === "/") {
    return pathname === "/";
  }
  return pathname === tabHref || pathname.startsWith(`${tabHref}/`);
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  /** Search filters the Meetings page by title. */
  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const searchText = new FormData(event.currentTarget).get("search")?.toString().trim() ?? "";
    router.push(searchText ? `/meetings?search=${encodeURIComponent(searchText)}` : "/meetings");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white">
      <div className="flex h-14 items-center gap-4 px-4 md:px-6">
        <ZoomLogo />

        <nav aria-label="Main" className="flex flex-1 justify-center">
          <ul className="flex items-center gap-1">
            {NAV_TABS.map((tab) => {
              const isActive = isTabActive(tab.href, pathname);
              const TabIcon = tab.icon;
              return (
                <li key={tab.href} className={tab.isPlaceholder ? "hidden md:block" : ""}>
                  <Link
                    href={tab.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-zoom-blue ${
                      isActive ? "text-zoom-blue" : "text-ink-muted hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <TabIcon size={20} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
                    <span className="hidden lg:inline">{tab.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <form role="search" onSubmit={handleSearch} className="hidden md:block">
          <label className="flex h-8 w-56 items-center gap-2 rounded-lg bg-canvas px-3 text-sm text-ink-muted focus-within:ring-2 focus-within:ring-zoom-blue">
            <Search size={16} aria-hidden />
            <input
              name="search"
              type="search"
              placeholder="Search meetings"
              aria-label="Search meetings"
              className="w-full bg-transparent text-ink placeholder:text-ink-muted focus:outline-none"
            />
          </label>
        </form>

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
          className="rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-zoom-blue"
        >
          <Settings size={20} aria-hidden />
        </button>

        <ProfileMenu onOpenSettings={() => setIsSettingsOpen(true)} />
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </header>
  );
}

/**
 * A row of tabs with Zoom's blue underline on the selected one.
 *
 * Controlled: the parent keeps the selected tab id and renders the matching panel.
 * The ARIA roles (tablist / tab / aria-selected) tell screen readers this is a set of tabs.
 */

"use client";

type Tab<TabId extends string> = { id: TabId; label: string };

type TabsProps<TabId extends string> = {
  tabs: Tab<TabId>[];
  activeTab: TabId;
  onChange: (tabId: TabId) => void;
  ariaLabel: string;
};

export function Tabs<TabId extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
}: TabsProps<TabId>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-6 border-b border-line">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-zoom-blue ${
              isActive
                ? "border-zoom-blue text-zoom-blue"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

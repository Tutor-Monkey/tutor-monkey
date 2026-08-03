"use client";

import { Files, Sparkles } from "lucide-react";
import {
  WORKSPACE_TABS,
  type WorkspaceTabId,
} from "@/lib/teachers/fileBrowser";

const TAB_ICONS: Record<WorkspaceTabId, typeof Files> = {
  documents: Files,
  materials: Sparkles,
};

type WorkspaceTabsProps = {
  activeTab: WorkspaceTabId;
  onChange: (tab: WorkspaceTabId) => void;
};

/**
 * Primary Documents / Materials tab bar for the workspace-level file
 * browser. Rendered above the active view (visible on desktop and mobile);
 * the sidebar mirrors the same state. Terminology is exact: Documents =
 * imported source files, Materials = generated content.
 */
export function WorkspaceTabs({ activeTab, onChange }: WorkspaceTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Workspace tabs"
      className="mb-6 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm"
    >
      {WORKSPACE_TABS.map((tab) => {
        const Icon = TAB_ICONS[tab.id];
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
              active
                ? "bg-gray-900 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
